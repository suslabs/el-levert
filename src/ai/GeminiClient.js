import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import SSEUtil from "../util/misc/SSEUtil.js";
import StreamUtil from "../util/misc/StreamUtil.js";
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
            thinking: true,

            tokens: 0,
            reasoning: 0
        };
    }

    getModel(state) {
        return this.models[state.modelIdx] ?? null;
    }

    async generate(body, state, options) {
        options = ObjectUtil.guaranteeObject(options);

        const res = await this._send(body, state, options, false);

        GeminiClient._addUsage(state, res.data.usageMetadata);
        GeminiClient._useModel(state, this.getModel(state));

        return res.data;
    }

    async stream(body, state, options) {
        options = ObjectUtil.guaranteeObject(options);

        const onParts = options.onParts,
            onRestart = options.onRestart;

        const signal = options.signal ?? null;

        for (;;) {
            const res = await this._send(body, state, options, true),
                out = await GeminiClient._catchAbort(this._readStream(res.data, state, onParts), signal);

            if (out !== null) {
                GeminiClient._useModel(state, this.getModel(state));
                return out;
            }

            getLogger().warn(`AI model ${this.getModel(state)} stopped mid-answer, switching to the next one.`);

            state.modelIdx++;
            await onRestart();
        }
    }

    static _thinkingErrorRegex = /thinking/i;
    static _timeoutErrors = new Set(["CanceledError", "AbortError"]);

    static async _catchAbort(promise, signal) {
        try {
            return await promise;
        } catch (err) {
            if (!GeminiClient._timeoutErrors.has(err.name)) {
                throw err;
            }

            throw new AIError(signal?.aborted ? "Answer cancelled" : "Gemini took too long to respond");
        }
    }

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

    _createSignal(timeLeft, signal) {
        if (!Number.isFinite(timeLeft)) {
            return signal;
        }

        const timeout = Util.clamp(timeLeft, GeminiClient.minTimeout, this.requestTimeout),
            timeoutSignal = AbortSignal.timeout(timeout);

        return signal === null ? timeoutSignal : AbortSignal.any([timeoutSignal, signal]);
    }

    _getUrl(model, stream) {
        const base = `${this.endpoint}/models/${encodeURIComponent(model)}`;
        return stream ? `${base}:streamGenerateContent?alt=sse` : `${base}:generateContent`;
    }

    _buildBody(body, state, thinkingLevel) {
        if (!state.thinking || thinkingLevel === null) {
            return body;
        }

        return {
            ...body,
            generationConfig: {
                ...body.generationConfig,
                thinkingConfig: { thinkingLevel }
            }
        };
    }

    async _post(model, body, state, options, stream) {
        const thinkingLevel = options.thinkingLevel ?? this.thinkingLevel;

        const timeLeft = options.timeLeft ?? Infinity,
            signal = options.signal ?? null;

        const res = await GeminiClient._catchAbort(
            this.http.request({
                url: this._getUrl(model, stream),
                method: "post",
                headers: {
                    "content-type": "application/json",
                    "x-goog-api-key": this.apiKeys[this.keyIdx]
                },
                data: this._buildBody(body, state, thinkingLevel),
                responseType: stream ? "stream" : "json",
                signal: this._createSignal(timeLeft, signal),
                validateStatus: () => true
            }),
            signal
        );

        if (stream && !isSuccessStatus(res.status)) {
            res.data = GeminiClient._parseError((await StreamUtil.read(res.data)).toString());
        }

        return res;
    }

    _isThinkingError(res) {
        return GeminiClient._thinkingErrorRegex.test(GeminiClient._errorMessage(res));
    }

    async _request(model, body, state, options, stream) {
        const res = await this._post(model, body, state, options, stream);

        if (res.status === httpStatusCodes.BAD_REQUEST && state.thinking && this._isThinkingError(res)) {
            state.thinking = false;
            return await this._post(model, body, state, options, stream);
        }

        return res;
    }

    async _requestWithKeys(model, body, state, options, stream) {
        let res;

        for (let i = 0; i < this.apiKeys.length; i++) {
            res = await this._request(model, body, state, options, stream);

            if (res.status !== httpStatusCodes.TOO_MANY_REQUESTS) {
                break;
            }

            this.keyIdx = (this.keyIdx + 1) % this.apiKeys.length;
        }

        return res;
    }

    _createError(model, res) {
        return new AIError(`${model}: HTTP ${res.status} ${GeminiClient._errorMessage(res)}`.trim(), {
            model,
            status: res.status,
            reason: res.data?.error?.status ?? null
        });
    }

    async _send(body, state, options, stream) {
        let status = null;

        for (; state.modelIdx < this.models.length; state.modelIdx++) {
            const model = this.models[state.modelIdx],
                res = await this._requestWithKeys(model, body, state, options, stream);

            if (isSuccessStatus(res.status)) {
                return res;
            } else if (!GeminiClient._canFallback(res.status)) {
                throw this._createError(model, res);
            }

            status = res.status;
            getLogger().warn(`AI model ${model} is unavailable (HTTP ${status}), switching to the next one.`);
        }

        throw new AIError("All models are unavailable right now", { models: this.models, status });
    }

    async _readStream(stream, state, onParts) {
        const parts = [];
        let usage = null;

        let finishReason = null,
            blockReason = null,
            interrupted = false;

        for await (const event of SSEUtil.readEvents(stream)) {
            const data = JSON.parse(event),
                candidate = Util.first(data.candidates ?? []);

            usage = data.usageMetadata ?? usage;
            blockReason = data.promptFeedback?.blockReason ?? blockReason;
            interrupted ||= typeof data.error !== "undefined";

            if (typeof candidate === "undefined") {
                continue;
            }

            const chunkParts = candidate.content?.parts ?? [];
            finishReason = candidate.finishReason ?? finishReason;

            parts.push(...chunkParts);
            await onParts(chunkParts);
        }

        GeminiClient._addUsage(state, usage);

        if (blockReason !== null) {
            return { parts, finishReason: blockReason };
        } else if (interrupted || finishReason === null) {
            return null;
        }

        return { parts, finishReason };
    }
}

export default GeminiClient;
