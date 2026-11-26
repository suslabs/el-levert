import AIProvider from "./AIProvider.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import SSEUtil from "../../util/misc/SSEUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import AIUtil from "../../util/ai/AIUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

function getMetadataHeader(res, name) {
    const headers = res?.data?.error?.metadata?.headers;

    if (!TypeTester.isObject(headers)) {
        return null;
    }

    const target = name.toLowerCase();
    return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1] ?? null;
}

function getCallId(turnIdx, i) {
    return `call_${turnIdx}_${i}`;
}

function toContentPart(part) {
    if (typeof part.inlineData !== "undefined") {
        const url = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        return { type: "image_url", image_url: { url } };
    }

    return { type: "text", text: part.text };
}

function toAssistantMessage(content, turnIdx) {
    const calls = AIUtil.getCalls(content.parts),
        text = AIUtil.getText(content.parts);

    const message = { role: "assistant", content: Util.empty(text) ? null : text };

    if (!Util.empty(calls)) {
        message.tool_calls = calls.map((call, i) => ({
            id: call.id ?? getCallId(turnIdx, i),
            type: "function",
            function: { name: call.name, arguments: JSON.stringify(call.args) }
        }));
    }

    return [message];
}

function toUserMessages(content, turnIdx) {
    const responses = content.parts.filter(part => typeof part.functionResponse !== "undefined"),
        inputs = content.parts.filter(
            part => (typeof part.text === "string" && !part.thought) || typeof part.inlineData !== "undefined"
        );

    const messages = responses.map((part, i) => ({
        role: "tool",
        tool_call_id: part.functionResponse.id ?? getCallId(turnIdx - 1, i),
        content: JSON.stringify(part.functionResponse.response)
    }));

    if (!Util.empty(inputs)) {
        messages.push({ role: "user", content: inputs.map(toContentPart) });
    }

    return messages;
}

function toMessages(content, turnIdx) {
    if (content.role === "model") {
        return toAssistantMessage(content, turnIdx);
    }

    return toUserMessages(content, turnIdx);
}

function toChat(body) {
    const messages = [],
        system = AIUtil.getText(body.systemInstruction?.parts ?? []);

    if (!Util.empty(system)) {
        messages.push({ role: "system", content: system });
    }

    body.contents.forEach((content, i) => messages.push(...toMessages(content, i)));

    const chat = { messages },
        declarations = Util.first(body.tools)?.functionDeclarations ?? [];

    if (!Util.empty(declarations)) {
        chat.tools = declarations.map(decl => ({ type: "function", function: decl }));

        const calling = body.toolConfig?.functionCallingConfig,
            forcedTool = calling?.mode === "ANY" ? Util.first(calling.allowedFunctionNames) : null;

        chat.tool_choice =
            typeof forcedTool === "string" ? { type: "function", function: { name: forcedTool } } : "auto";
    }

    const schema = body.generationConfig?.responseSchema;

    if (typeof schema !== "undefined") {
        chat.response_format = { type: "json_schema", json_schema: { name: "response", schema } };
    }

    return chat;
}

function addCallDeltas(calls, deltas) {
    for (const delta of deltas) {
        const call = (calls[delta.index] ??= { id: null, name: "", args: "" });

        call.id = delta.id ?? call.id;
        call.name += delta.function?.name ?? "";
        call.args += delta.function?.arguments ?? "";
    }
}

function toCallPart(call) {
    const functionCall = { name: call.name, args: Util.empty(call.args) ? {} : AIUtil.parseJson(call.args, {}) };

    if (call.id !== null) {
        functionCall.id = call.id;
    }

    return { functionCall };
}

function toParts(content, toolCalls) {
    return []
        .concat(
            Util.nonemptyString(content) && { text: content },
            toolCalls.map(call => toCallPart({ id: call.id, name: call.function.name, args: call.function.arguments }))
        )
        .filter(Boolean);
}

function parseUsage(usage) {
    usage = ObjectUtil.guaranteeObject(usage);

    return {
        tokens: usage.total_tokens ?? 0,
        cached: usage.prompt_tokens_details?.cached_tokens ?? 0,
        reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0
    };
}

class OpenRouterProvider extends AIProvider {
    static $name = "openrouter";

    static chatPath = "chat/completions";
    static doneEvent = "[DONE]";
    static freeSuffix = ":free";

    static finishReasons = Object.freeze({
        stop: "STOP",
        tool_calls: "STOP",
        length: "MAX_TOKENS",
        content_filter: "SAFETY"
    });

    buildRequest(model, key, body, options) {
        options = ObjectUtil.guaranteeObject(options);

        const stream = options.stream ?? false;

        const data = { ...toChat(body), model, stream };

        if (stream) {
            data.stream_options = { include_usage: true };
        }

        return {
            url: HTTPUtil.joinUrl(this.endpoint, OpenRouterProvider.chatPath),
            headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
            data
        };
    }

    parseResponse(data) {
        const message = Util.first(data.choices).message;

        return {
            parts: toParts(message.content, message.tool_calls ?? []),
            usage: parseUsage(data.usage)
        };
    }

    async readStream(stream, onParts) {
        const parts = [],
            calls = [];

        let usage = null;

        let finishReason = null,
            error = null;

        for await (const event of SSEUtil.readEvents(stream)) {
            if (event === OpenRouterProvider.doneEvent) {
                continue;
            }

            const data = JSON.parse(event),
                choice = Util.first(data.choices);

            usage = data.usage ?? usage;
            error = data.error ?? error;

            if (typeof choice === "undefined") {
                continue;
            }

            finishReason = choice.finish_reason ?? finishReason;

            addCallDeltas(calls, choice.delta.tool_calls ?? []);

            if (Util.nonemptyString(choice.delta.content)) {
                const textParts = [{ text: choice.delta.content }];

                parts.push(...textParts);
                await onParts(textParts);
            }
        }

        parts.push(...calls.map(toCallPart));

        return {
            parts,
            finishReason: error === null ? OpenRouterProvider._getFinishReason(finishReason) : null,
            error,
            usage: parseUsage(usage)
        };
    }

    getQuotaKeys(model, keyIdx) {
        const keys = super.getQuotaKeys(model, keyIdx);

        if (model.endsWith(OpenRouterProvider.freeSuffix)) {
            keys.splice(1, 0, `${this.name}:free#${keyIdx}`);
        }

        return keys;
    }

    getQuotaKey(res, model, keyIdx) {
        if (res?.status === httpStatusCodes.TOO_MANY_REQUESTS && OpenRouterProvider._isFreeAccountLimit(res)) {
            return model.endsWith(OpenRouterProvider.freeSuffix)
                ? `${this.name}:free#${keyIdx}`
                : `${this.name}#${keyIdx}`;
        }

        return super.getQuotaKey(res, model, keyIdx);
    }

    getUnblockDelay(res) {
        let delay = super.getUnblockDelay(res);

        if (delay === null) {
            const metaRetryAfter = getMetadataHeader(res, "retry-after");

            if (metaRetryAfter != null) {
                delay = super.getUnblockDelay({ headers: { "retry-after": metaRetryAfter } });
            }
        }

        if (delay !== null || res?.status !== httpStatusCodes.TOO_MANY_REQUESTS) {
            return delay;
        }

        const reset = res?.headers?.["x-ratelimit-reset"] ?? getMetadataHeader(res, "x-ratelimit-reset");
        return OpenRouterProvider._parseRateLimitReset(reset);
    }

    static _minEpochMs = 1e12;
    static _freeTierSourceRegex = /free[_ -]?tier/i;
    static _freeLimitMessageRegex = /free-models-per-(?:day|min)/i;

    static _isFreeAccountLimit(res) {
        const error = res?.data?.error,
            limitSource = error?.metadata?.limit_source ?? "";

        if (OpenRouterProvider._freeTierSourceRegex.test(limitSource)) {
            return true;
        }

        return OpenRouterProvider._freeLimitMessageRegex.test(String(error?.message ?? ""));
    }

    static _parseRateLimitReset(reset) {
        if (reset == null) {
            return null;
        }

        const str = String(reset).trim();

        if (Util.empty(str)) {
            return null;
        }

        const ts = Number(str);

        if (!Number.isFinite(ts)) {
            return null;
        }

        const resetAt = ts < OpenRouterProvider._minEpochMs ? ts / Util.durationSeconds.milli : ts,
            resetIn = resetAt - Date.now();

        return resetIn > 0 ? resetIn : null;
    }

    static _getFinishReason(reason) {
        if (reason === null) {
            return null;
        }

        return OpenRouterProvider.finishReasons[reason] ?? reason.toUpperCase();
    }
}

export default OpenRouterProvider;
