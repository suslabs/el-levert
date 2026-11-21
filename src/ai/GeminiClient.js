import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
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
            thinking: !Util.empty(this.thinkingLevel)
        };
    }

    async generate(body, state, timeLeft) {
        const models = state.model === null ? this.models.slice(state.modelIdx) : [state.model];
        let lastErr = new AIError("No model available", { models: this.models });

        for (const model of models) {
            const res = await this._request(model, body, state, timeLeft);

            if (isSuccessStatus(res.status)) {
                state.model = model;
                return res.data;
            }

            lastErr = this._createError(model, res);

            if (state.model !== null || !this._canFallback(res.status)) {
                throw lastErr;
            }

            state.modelIdx++;
        }

        throw lastErr;
    }

    static _thinkingErrorRegex = /thinking/i;

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

    async _post(model, body, state, timeLeft) {
        return await this.http.request({
            url: `${this.endpoint}/models/${encodeURIComponent(model)}:generateContent`,
            method: "post",
            headers: {
                "content-type": "application/json",
                "x-goog-api-key": this.apiKey
            },
            data: this._buildBody(body, state),
            responseType: "json",
            timeout: Math.max(GeminiClient.minTimeout, Math.min(this.requestTimeout, timeLeft)),
            validateStatus: () => true
        });
    }

    async _request(model, body, state, timeLeft) {
        const res = await this._post(model, body, state, timeLeft);

        if (res.status === httpStatusCodes.BAD_REQUEST && state.thinking && this._isThinkingError(res)) {
            state.thinking = false;
            return await this._post(model, body, state, timeLeft);
        }

        return res;
    }

    _errorMessage(res) {
        return String(res.data?.error?.message ?? res.statusText ?? "");
    }

    _isThinkingError(res) {
        return GeminiClient._thinkingErrorRegex.test(this._errorMessage(res));
    }

    _canFallback(status) {
        return (
            status === httpStatusCodes.TOO_MANY_REQUESTS ||
            status === httpStatusCodes.NOT_FOUND ||
            isServerErrorStatus(status)
        );
    }

    _createError(model, res) {
        return new AIError(`${model}: HTTP ${res.status} ${this._errorMessage(res)}`.trim(), {
            model,
            status: res.status,
            reason: res.data?.error?.status ?? null
        });
    }
}

export default GeminiClient;
