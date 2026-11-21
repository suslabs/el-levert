import AIPrompt from "./AIPrompt.js";
import AISourceLedger from "./AISourceLedger.js";

import AIStepStatus from "./AIStepStatus.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import AIError from "../errors/AIError.js";

class AISession {
    static minCallTime = 2 / Util.durationSeconds.milli;

    constructor(manager, request, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.manager = manager;
        this.request = request;

        this.history = options.history ?? [];
        this.onProgress = options.onProgress ?? null;

        this.deadline = Date.now() + manager.timeLimit;
        this.state = manager.gemini.createState();

        this.ledger = new AISourceLedger({
            attachments: AISession._attachmentUrls(request.msg),
            reply: request.replyMsg?.content ?? null,
            replyAttachments: AISession._attachmentUrls(request.replyMsg)
        });

        this.steps = [];
        this.contents = [];
    }

    get timeLeft() {
        return this.deadline - Date.now();
    }

    get model() {
        return this.state.model;
    }

    async run(question) {
        const systemInstruction = {
            parts: [{ text: AIPrompt.build(this.request, this.manager.tools.getNames(this)) }]
        };

        this.contents = [
            ...this.history.map(turn => ({ role: turn.role, parts: [{ text: turn.text }] })),
            { role: "user", parts: [{ text: question }] }
        ];

        this.ledger.record(question);

        for (let i = 0; i < this.manager.maxSteps; i++) {
            if (this.timeLeft < AISession.minCallTime) {
                throw new AIError("Ran out of time", { steps: this.steps.length });
            }

            const forceFinal = i === this.manager.maxSteps - 1 || this.timeLeft < this.manager.requestTimeout,
                body = this._buildRequest(systemInstruction, forceFinal);

            const data = await this.manager.gemini.generate(body, this.state, this.timeLeft),
                result = await this._handleResponse(data);

            if (result !== null) {
                return result;
            }
        }

        throw new AIError("Ran out of steps", { steps: this.steps.length });
    }

    async generateText(parts) {
        const data = await this.manager.gemini.generate(
            { contents: [{ role: "user", parts }] },
            this.state,
            this.timeLeft
        );
        return AISession._getText(data);
    }

    toolTimeout() {
        return Util.clamp(
            this.timeLeft - this.manager.requestTimeout,
            AISession.minCallTime,
            this.manager.requestTimeout
        );
    }

    logError(toolName, err) {
        getLogger().error(`AI tool "${toolName}" failed:`, err);
    }

    static _createResponse(call, res) {
        return {
            functionResponse: {
                ...(typeof call.id === "undefined" ? {} : { id: call.id }),
                name: call.name,
                response: res
            }
        };
    }

    static _getText(data) {
        const parts = Util.first(data?.candidates ?? [])?.content?.parts ?? [];

        return parts
            .filter(part => typeof part.text === "string" && !part.thought)
            .map(part => part.text)
            .join("")
            .trim();
    }

    static _attachmentUrls(msg) {
        return msg == null ? [] : Array.from(msg.attachments.values()).map(attach => attach.url);
    }

    _buildRequest(systemInstruction, forceFinal) {
        const callingConfig = forceFinal
            ? { mode: "ANY", allowedFunctionNames: [this.manager.tools.finalName] }
            : { mode: "ANY" };

        return {
            systemInstruction,
            contents: this.contents,
            tools: [{ functionDeclarations: this.manager.tools.getDeclarations(this) }],
            toolConfig: { functionCallingConfig: callingConfig }
        };
    }

    async _handleResponse(data) {
        const candidate = Util.first(data?.candidates ?? []),
            parts = candidate?.content?.parts ?? [];

        const calls = parts.filter(part => part.functionCall != null).map(part => part.functionCall);

        if (Util.empty(calls)) {
            return this._handleText(data, candidate);
        }

        this.contents.push(candidate.content);

        const finalName = this.manager.tools.finalName,
            final = calls.find(call => call.name === finalName);

        if (final != null && Util.single(calls)) {
            return await this._finalize(final.args ?? {});
        }

        const responses = await this._runCalls(calls, finalName);
        this.contents.push({ role: "user", parts: responses });

        return null;
    }

    _handleText(data, candidate) {
        const text = AISession._getText(data);

        if (Util.empty(text)) {
            const reason = candidate?.finishReason ?? data?.promptFeedback?.blockReason ?? "empty response";
            throw new AIError(`The model returned no answer (${reason})`, { reason });
        }

        return this._finalize({ finalAnswer: text, followUps: [], sources: [] });
    }

    async _finalize(args) {
        const result = await this.manager.tools.get(this.manager.tools.finalName, this).execute(args, this);

        return {
            ...result,
            model: this.model,
            steps: this.steps
        };
    }

    async _runCalls(calls, finalName) {
        const pending = calls.map(call => ({
            call,
            step:
                call.name === finalName
                    ? null
                    : { tool: call.name, args: call.args ?? {}, status: AIStepStatus.running }
        }));

        this.steps.push(...pending.map(entry => entry.step).filter(step => step !== null));
        await this._reportProgress();

        return await Promise.all(pending.map(entry => this._runCall(entry.call, entry.step)));
    }

    async _runCall(call, step) {
        if (step === null) {
            return AISession._createResponse(call, {
                error: "Ignored: final_response must be called alone, after reading the tool results."
            });
        }

        const res = await this.manager.tools.execute(call.name, call.args, this);

        step.status = typeof res.error === "undefined" ? AIStepStatus.done : AIStepStatus.failed;
        this.ledger.record(res);

        await this._reportProgress();
        return AISession._createResponse(call, res);
    }

    async _reportProgress() {
        if (typeof this.onProgress !== "function") {
            return;
        }

        await this.onProgress(this);
    }
}

export default AISession;
