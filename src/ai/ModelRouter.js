import ModelQuotas from "./ModelQuotas.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import StreamUtil from "../util/misc/StreamUtil.js";
import AIUtil from "../util/ai/AIUtil.js";
import { httpStatusCodes, isServerErrorStatus, isSuccessStatus } from "../util/misc/HttpStatusCodes.js";

import AIError from "../errors/AIError.js";

class ModelRouter {
    static minTimeout = 1 / Util.durationSeconds.milli;

    static providerSeparator = ":";

    static parseModel(id, providerNames, defaultProvider) {
        const [prefix, ...rest] = id.split(ModelRouter.providerSeparator);

        if (providerNames.includes(prefix) && !Util.empty(rest)) {
            return { id, provider: prefix, name: rest.join(ModelRouter.providerSeparator) };
        }

        return { id, provider: defaultProvider, name: id };
    }

    constructor(http, providers, models, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;

        this.providers = providers;
        this.models = models;

        this.thinkingLevel = options.thinkingLevel;
        this.requestTimeout = options.requestTimeout;

        this.quotas = new ModelQuotas(options.modelCooldown ?? 0, options.maxModelCooldown ?? 0);
        this.rejectedKeys = new Set();
    }

    get endpoints() {
        return Array.from(this.providers.values(), provider => provider.endpoint);
    }

    createState() {
        return {
            modelIdx: 0,
            keyIdx: 0,
            failed: new Set(),
            lastStatus: null,
            models: [],
            noThinking: new Set(),

            tokens: 0,
            reasoning: 0
        };
    }

    getModel(state) {
        return this._getSpec(state)?.id ?? null;
    }

    async generate(body, state, options) {
        options = ObjectUtil.guaranteeObject(options);

        const res = await this._send(body, state, options, false),
            out = this._getProvider(state).parseResponse(res.data);

        ModelRouter._addUsage(state, this.getModel(state), out.usage);
        ModelRouter._useModel(state, this.getModel(state));

        return out;
    }

    async stream(body, state, options) {
        options = ObjectUtil.guaranteeObject(options);

        const onParts = options.onParts,
            onRestart = options.onRestart;

        const signal = options.signal ?? null;

        for (;;) {
            const res = await this._send(body, state, options, true),
                out = await ModelRouter._catchAbort(this._readStream(res.data, state, onParts), signal);

            if (out !== null) {
                ModelRouter._useModel(state, this.getModel(state));
                return out;
            }

            this._fail(state, this._getSpec(state), state.keyIdx, "stopped mid-answer");

            await onRestart();
        }
    }

    static _timeoutErrors = new Set(["CanceledError", "AbortError"]);

    static async _catchAbort(promise, signal) {
        try {
            return await promise;
        } catch (err) {
            if (!ModelRouter._timeoutErrors.has(err.name)) {
                throw err;
            }

            if (signal?.aborted) {
                throw new AIError("Answer cancelled");
            }

            throw new AIError("The model took too long to respond", { timedOut: true });
        }
    }

    static _addUsage(state, model, usage) {
        state.tokens += usage.tokens;
        state.reasoning += usage.reasoning;

        getLogger().debug(
            `AI request to ${model} used ${Util.formatNumber(usage.tokens)} tokens (${Util.formatNumber(usage.cached)} cached).`
        );
    }

    static _useModel(state, model) {
        if (!state.models.includes(model)) {
            state.models.push(model);
        }
    }

    static _isKeyRejected(status) {
        return status === httpStatusCodes.UNAUTHORIZED || status === httpStatusCodes.FORBIDDEN;
    }

    static _canFallback(status) {
        return (
            status === httpStatusCodes.TOO_MANY_REQUESTS ||
            status === httpStatusCodes.NOT_FOUND ||
            ModelRouter._isKeyRejected(status) ||
            isServerErrorStatus(status)
        );
    }

    static _combineSignals(timeoutSignal, signal) {
        return signal === null ? timeoutSignal : AbortSignal.any([timeoutSignal, signal]);
    }

    static _getProviderKeyId(provider, keyIdx) {
        return `${provider}#${keyIdx}`;
    }

    static _getKeyId(model, keyIdx) {
        return `${model}#${keyIdx}`;
    }

    _getSpec(state) {
        return this.models[state.modelIdx] ?? null;
    }

    _getProviderFor(spec) {
        return this.providers.get(spec.provider);
    }

    _getProvider(state) {
        return this._getProviderFor(this._getSpec(state));
    }

    async _fetch(config, timeLeft, signal) {
        const timeout = Util.clamp(timeLeft, ModelRouter.minTimeout, this.requestTimeout),
            controller = new AbortController();

        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            return await ModelRouter._catchAbort(
                this.http.request({ ...config, signal: ModelRouter._combineSignals(controller.signal, signal) }),
                signal
            );
        } finally {
            clearTimeout(timer);
        }
    }

    async _post(spec, keyIdx, body, state, options, stream) {
        const provider = this._getProviderFor(spec);

        const thinkingLevel = state.noThinking.has(spec.id) ? null : (options.thinkingLevel ?? this.thinkingLevel);

        const timeLeft = options.timeLeft ?? Infinity,
            signal = options.signal ?? null;

        const request = provider.buildRequest(spec.name, provider.keys[keyIdx], body, { stream, thinkingLevel });

        const res = await this._fetch(
            {
                ...request,
                method: "post",
                responseType: stream ? "stream" : "json",
                validateStatus: () => true
            },
            timeLeft,
            signal
        );

        if (stream && !isSuccessStatus(res.status)) {
            const text = (await StreamUtil.read(res.data)).toString();
            res.data = AIUtil.parseJson(text, { error: { message: text } });
        }

        return res;
    }

    async _request(spec, keyIdx, body, state, options, stream) {
        const res = await this._post(spec, keyIdx, body, state, options, stream);

        if (!state.noThinking.has(spec.id) && this._getProviderFor(spec).isThinkingError(res)) {
            state.noThinking.add(spec.id);
            return await this._post(spec, keyIdx, body, state, options, stream);
        }

        return res;
    }

    async _tryRequest(spec, keyIdx, body, state, options, stream) {
        try {
            return await this._request(spec, keyIdx, body, state, options, stream);
        } catch (err) {
            if (err.ref?.timedOut !== true) {
                throw err;
            }

            return null;
        }
    }

    _fail(state, spec, keyIdx, reason, res = null) {
        const keyId = ModelRouter._getKeyId(spec.id, keyIdx),
            status = res?.status ?? null;

        state.failed.add(keyId);
        state.lastStatus = status;

        if (status !== httpStatusCodes.TOO_MANY_REQUESTS) {
            getLogger().warn(`AI model ${spec.id} ${reason} on key ${keyIdx + 1}, trying the next one.`);
            return;
        }

        const delay = this.quotas.limit(keyId, this._getProviderFor(spec).getUnblockDelay(res));
        getLogger().warn(
            `AI model ${spec.id} hit its usage limit on key ${keyIdx + 1}, blocked for ${AIUtil.formatDuration(delay)}.`
        );
    }

    _rejectKey(state, spec, keyIdx, res) {
        const provider = this._getProviderFor(spec);

        state.lastStatus = res.status;
        this.rejectedKeys.add(ModelRouter._getProviderKeyId(spec.provider, keyIdx));

        getLogger().error(
            `AI key ${keyIdx + 1} for ${spec.provider} was rejected (HTTP ${res.status} ${provider.getErrorMessage(res)}). Skipping it until the bot restarts.`
        );
    }

    _canUseKey(state, spec, keyIdx) {
        const keyId = ModelRouter._getKeyId(spec.id, keyIdx);

        return (
            !this.rejectedKeys.has(ModelRouter._getProviderKeyId(spec.provider, keyIdx)) &&
            !state.failed.has(keyId) &&
            !this.quotas.isLimited(keyId)
        );
    }

    async _requestWithKeys(spec, body, state, options, stream) {
        const keys = this._getProviderFor(spec).keys;

        let failed = null;

        for (let i = 0; i < keys.length; i++) {
            if (!this._canUseKey(state, spec, i)) {
                continue;
            }

            const res = await this._tryRequest(spec, i, body, state, options, stream);

            if (res === null) {
                this._fail(state, spec, i, "took too long to respond");
                continue;
            } else if (ModelRouter._isKeyRejected(res.status)) {
                this._rejectKey(state, spec, i, res);

                failed = res;
                continue;
            } else if (ModelRouter._canFallback(res.status)) {
                this._fail(state, spec, i, `is unavailable (HTTP ${res.status})`, res);

                failed = res;
                continue;
            }

            if (isSuccessStatus(res.status)) {
                this.quotas.reset(ModelRouter._getKeyId(spec.id, i));
                state.keyIdx = i;
            }

            return res;
        }

        return failed;
    }

    _createError(spec, res) {
        const provider = this._getProviderFor(spec);

        return new AIError(`${spec.id}: HTTP ${res.status} ${provider.getErrorMessage(res)}`.trim(), {
            model: spec.id,
            status: res.status
        });
    }

    _getModelRetryTime(spec) {
        const keys = this._getProviderFor(spec).keys;
        return Math.min(...keys.map((_, i) => this.quotas.getTimeLeft(ModelRouter._getKeyId(spec.id, i))));
    }

    _getRetryTime() {
        return Math.min(...this.models.map(spec => this._getModelRetryTime(spec)));
    }

    async _send(body, state, options, stream) {
        for (; state.modelIdx < this.models.length; state.modelIdx++) {
            const spec = this.models[state.modelIdx],
                res = await this._requestWithKeys(spec, body, state, options, stream);

            if (res === null) {
                continue;
            } else if (isSuccessStatus(res.status)) {
                return res;
            } else if (!ModelRouter._canFallback(res.status)) {
                throw this._createError(spec, res);
            }
        }

        const retryIn = this._getRetryTime(),
            status = state.lastStatus ?? (retryIn > 0 ? httpStatusCodes.TOO_MANY_REQUESTS : null);

        throw new AIError("All models are unavailable right now", { status, retryIn });
    }

    async _readStream(stream, state, onParts) {
        const out = await this._getProvider(state).readStream(stream, onParts);
        ModelRouter._addUsage(state, this.getModel(state), out.usage);

        if (out.finishReason === null) {
            return null;
        }

        return { parts: out.parts, finishReason: out.finishReason };
    }
}

export default ModelRouter;
