import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import SSEUtil from "../util/misc/SSEUtil.js";
import { httpStatusCodes, isServerErrorStatus, isSuccessStatus } from "../util/misc/HttpStatusCodes.js";

import AIError from "../errors/AIError.js";

class GeminiClient {
    static minTimeout = 1 / Util.durationSeconds.milli;

    constructor(http, apiKeys, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;

        this.apiKeys = apiKeys;
        this.keyIdx = 0;

        this.endpoint = options.endpoint;
        this.models = options.models;
        this.thinkingLevel = options.thinkingLevel;
        this.requestTimeout = options.requestTimeout;
    }

    createState() {
        return {
            modelIdx: 0,
            models: [],
            thinking: !Util.empty(this.thinkingLevel),

            tokens: 0,
            reasoning: 0
        };
    }

    getModel(state) {
        return this.models[state.modelIdx] ?? null;
    }

    async generate(body, state, timeLeft) {
        const res = await this._send(body, state, timeLeft, false);

        GeminiClient._addUsage(state, res.data.usageMetadata);
        return res.data;
    }

    async stream(body, state, timeLeft, onParts) {
        const res = await this._send(body, state, timeLeft, true);

        const parts = [];
        let usage = null;

        let finishReason = null,
            blockReason = null;

        for await (const event of SSEUtil.readEvents(res.data)) {
            const data = JSON.parse(event),
                candidate = Util.first(data.candidates ?? []);

            usage = data.usageMetadata ?? usage;
            blockReason = data.promptFeedback?.blockReason ?? blockReason;

            if (typeof candidate === "undefined") {
                continue;
            }

            const chunkParts = candidate.content?.parts ?? [];
            finishReason = candidate.finishReason ?? finishReason;

            parts.push(...chunkParts);
            await onParts(chunkParts);
        }

        GeminiClient._addUsage(state, usage);
        return { parts, finishReason: blockReason ?? finishReason };
    }

    static _thinkingErrorRegex = /thinking/i;

    static _addUsage(state, usage) {
        state.tokens += usage?.totalTokenCount ?? 0;
        state.reasoning += usage?.thoughtsTokenCount ?? 0;
    }

    static _useModel(state, model) {
        if (!state.models.includes(model)) {
            state.models.push(model);
        }
    }

    static _canFallback(status) {
        return (
            status === httpStatusCodes.TOO_MANY_REQUESTS ||
            status === httpStatusCodes.NOT_FOUND ||
            isServerErrorStatus(status)
        );
    }

    static _errorMessage(res) {
        return String(res.data?.error?.message ?? res.statusText ?? "");
    }

    static _parseError(text) {
        try {
            return JSON.parse(text);
        } catch {
            return { error: { message: text } };
        }
    }

    async _send(body, state, timeLeft, stream) {
        let status = null;

        for (; state.modelIdx < this.models.length; state.modelIdx++) {
            const model = this.models[state.modelIdx],
                res = await this._requestWithKeys(model, body, state, timeLeft, stream);

            if (isSuccessStatus(res.status)) {
                GeminiClient._useModel(state, model);
                return res;
            } else if (!GeminiClient._canFallback(res.status)) {
                throw this._createError(model, res);
            }

            status = res.status;
            getLogger().warn(`AI model ${model} is unavailable (HTTP ${status}), switching to the next one.`);
        }

        throw new AIError("All models are unavailable right now", { models: this.models, status });
    }

    async _requestWithKeys(model, body, state, timeLeft, stream) {
        let res;

        for (let i = 0; i < this.apiKeys.length; i++) {
            res = await this._request(model, body, state, timeLeft, stream);

            if (res.status !== httpStatusCodes.TOO_MANY_REQUESTS) {
                break;
            }

            this.keyIdx = (this.keyIdx + 1) % this.apiKeys.length;
        }

        return res;
    }

    async _request(model, body, state, timeLeft, stream) {
        const res = await this._post(model, body, state, timeLeft, stream);

        if (res.status === httpStatusCodes.BAD_REQUEST && state.thinking && this._isThinkingError(res)) {
            state.thinking = false;
            return await this._post(model, body, state, timeLeft, stream);
        }

        return res;
    }

    async _post(model, body, state, timeLeft, stream) {
        const timeout = Math.max(GeminiClient.minTimeout, Math.min(this.requestTimeout, timeLeft));

        const res = await this.http.request({
            url: this._getUrl(model, stream),
            method: "post",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": this.apiKeys[this.keyIdx]
            },
            data: this._buildBody(body, state),
            responseType: stream ? "stream" : "json",
            timeout,
            signal: AbortSignal.timeout(timeout),
            validateStatus: () => true
        });

        if (stream && !isSuccessStatus(res.status)) {
            res.data = GeminiClient._parseError(await SSEUtil.readText(res.data));
        }

        return res;
    }

    _getUrl(model, stream) {
        const base = `${this.endpoint}/models/${encodeURIComponent(model)}`;
        return stream ? `${base}:streamGenerateContent?alt=sse` : `${base}:generateContent`;
    }

    _buildBody(body, state) {
        if (!state.thinking) {
            return body;
        }

        return {
            ...body,
            generationConfig: {
                ...body.generationConfig,
                thinkingConfig: { thinkingLevel: this.thinkingLevel }
            }
        };
    }

    _isThinkingError(res) {
        return GeminiClient._thinkingErrorRegex.test(GeminiClient._errorMessage(res));
    }

    _createError(model, res) {
        return new AIError(`${model}: HTTP ${res.status} ${GeminiClient._errorMessage(res)}`.trim(), {
            model,
            status: res.status,
            reason: res.data?.error?.status ?? null
        });
    }
}

export default GeminiClient;
