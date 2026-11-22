import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import SSEUtil from "../util/misc/SSEUtil.js";
import { httpStatusCodes, isServerErrorStatus, isSuccessStatus } from "../util/misc/HttpStatusCodes.js";

import AIError from "../errors/AIError.js";

class GeminiClient {
    static minTimeout = 1 / Util.durationSeconds.milli;

    constructor(http, apiKey, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;
        this.apiKey = apiKey;

        this.endpoint = options.endpoint;
        this.models = options.models;
        this.thinkingLevel = options.thinkingLevel;
        this.requestTimeout = options.requestTimeout;
    }

    createState() {
        return {
            model: null,
            modelIdx: 0,
            thinking: !Util.empty(this.thinkingLevel),

            tokens: 0,
            reasoning: 0
        };
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
        const models = state.model === null ? this.models.slice(state.modelIdx) : [state.model];
        let lastErr = new AIError("No model available", { models: this.models });

        for (const model of models) {
            const res = await this._request(model, body, state, timeLeft, stream);

            if (isSuccessStatus(res.status)) {
                state.model = model;
                return res;
            }

            lastErr = this._createError(model, res);

            if (state.model !== null || !GeminiClient._canFallback(res.status)) {
                throw lastErr;
            }

            state.modelIdx++;
        }

        throw lastErr;
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
                "x-goog-api-key": this.apiKey
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
