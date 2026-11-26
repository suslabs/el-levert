import ModelQuotas from "./ModelQuotas.js";

import { getLogger } from "../LevertClient.js";

import Util from "../util/Util.js";
import LoggerUtil from "../util/LoggerUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";
import StreamUtil from "../util/misc/StreamUtil.js";
import AIUtil from "../util/ai/AIUtil.js";
import { httpStatusCodes, isServerErrorStatus, isSuccessStatus } from "../util/misc/HttpStatusCodes.js";

import AIError from "../errors/AIError.js";

function addUsage(state, model, usage) {
    state.tokens += usage.tokens;
    state.reasoning += usage.reasoning;

    getLogger().debug(
        `AI request to ${model} used ${Util.formatNumber(usage.tokens)} tokens (${Util.formatNumber(usage.cached)} cached).`
    );
}

function isKeyRejected(status) {
    return status === httpStatusCodes.UNAUTHORIZED || status === httpStatusCodes.FORBIDDEN;
}

function canCoolDown(status) {
    return (
        status === httpStatusCodes.TOO_MANY_REQUESTS ||
        status === httpStatusCodes.PAYMENT_REQUIRED ||
        status === httpStatusCodes.REQUEST_TIMEOUT ||
        isServerErrorStatus(status)
    );
}

function canFallback(status) {
    return status === httpStatusCodes.NOT_FOUND || isKeyRejected(status) || canCoolDown(status);
}

function combineSignals(timeoutSignal, signal) {
    return signal === null ? timeoutSignal : AbortSignal.any([timeoutSignal, signal]);
}

function getProviderKeyId(provider, keyIdx) {
    return `${provider}#${keyIdx}`;
}

function getKeyId(spec, keyIdx) {
    return `${spec.provider}:${spec.name}#${keyIdx}`;
}

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
        this.requestTimeout = Util.normalizeLimit(options.requestTimeout);
        this.redactLogText = options.redactLogText ?? LoggerUtil.redactText;

        this.quotas = new ModelQuotas(options.modelCooldown ?? 0, options.maxModelCooldown ?? -1);
        this.rejectedKeys = new Map();
    }

    get endpoints() {
        return Array.from(this.providers.values(), provider => provider.endpoint);
    }

    destroy() {
        this.quotas.destroy();
    }

    createState() {
        return {
            modelIdx: 0,
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
        return await this._send(body, state, options, false);
    }

    async stream(body, state, options) {
        const { parts, finishReason } = await this._send(body, state, options, true);
        return { parts, finishReason };
    }

    static _timeoutErrors = new Set(["CanceledError", "AbortError"]);

    _getSpec(state) {
        return this.models[state.modelIdx] ?? null;
    }

    _getProviderFor(spec) {
        return this.providers.get(spec.provider);
    }

    async _post(spec, keyIdx, body, options) {
        const provider = this._getProviderFor(spec);

        const stream = options.stream;

        const request = provider.buildRequest(spec.name, provider.keys[keyIdx], body, options),
            res = await this.http.request({
                ...request,
                method: "post",
                responseType: stream ? "stream" : "json",
                signal: options.signal,
                validateStatus: () => true
            });

        if (stream && !isSuccessStatus(res.status)) {
            const text = (await StreamUtil.read(res.data)).toString();
            res.data = AIUtil.parseJson(text, { error: { message: text } });
        }

        return res;
    }

    async _request(spec, keyIdx, body, state, options) {
        const provider = this._getProviderFor(spec);

        let res = await this._post(spec, keyIdx, body, options);

        if (options.thinkingLevel !== null && provider.isThinkingError(res)) {
            state.noThinking.add(spec.id);
            res = await this._post(spec, keyIdx, body, { ...options, thinkingLevel: null });
        }

        if (!isSuccessStatus(res.status)) {
            return { res, out: null };
        }

        const out = options.stream
            ? await provider.readStream(res.data, options.onParts)
            : provider.parseResponse(res.data);
        return { res, out };
    }

    async _tryRequest(spec, keyIdx, body, state, options, stream, deadline) {
        const controller = new AbortController(),
            startTimer = () => {
                const timeout = Util.getRemainingTime(deadline, this.requestTimeout, ModelRouter.minTimeout);
                return timeout === -1 ? null : setTimeout(() => controller.abort(), timeout);
            };

        let timer = startTimer();

        const onParts = options.onParts ?? null,
            refreshOnParts = parts => {
                if (timer !== null) {
                    clearTimeout(timer);
                }

                timer = startTimer();

                if (typeof onParts !== "function") {
                    return;
                }

                return onParts(parts);
            };

        const signal = options.signal ?? null,
            preferredLevel = options.thinkingLevel ?? this.thinkingLevel,
            thinkingLevel = state.noThinking.has(spec.id) ? null : preferredLevel;

        const requestOptions = {
            stream,
            thinkingLevel,
            signal: combineSignals(controller.signal, signal),
            onParts: refreshOnParts
        };

        try {
            return await this._request(spec, keyIdx, body, state, requestOptions);
        } catch (err) {
            if (signal?.aborted) {
                throw new AIError("Answer cancelled");
            } else if (controller.signal.aborted || ModelRouter._timeoutErrors.has(err.name)) {
                return null;
            }

            throw err;
        } finally {
            if (timer !== null) {
                clearTimeout(timer);
            }
        }
    }

    _fail(state, spec, keyIdx, stream, reason, res = null) {
        const status = res?.status ?? null;
        state.lastStatus = status;

        const message = res?.data?.error?.message,
            note = Util.nonemptyString(message) ? `: ${this.redactLogText(message)}` : "";

        if (isKeyRejected(status)) {
            this.rejectedKeys.set(getProviderKeyId(spec.provider, keyIdx), status);
            getLogger().error(
                `AI key ${keyIdx + 1} for ${spec.provider} was rejected (HTTP ${status}${note}). Skipping it until the bot restarts.`
            );
            return;
        }

        const keyId = getKeyId(spec, keyIdx);
        state.failed.add(keyId);

        if (!canCoolDown(status)) {
            getLogger().warn(`AI model ${spec.id} ${reason} on key ${keyIdx + 1}${note}. Trying the next one.`);
            return;
        }

        const retryDelay = this._getProviderFor(spec).getUnblockDelay(res),
            delay = this.quotas.limit(keyId, retryDelay, status, stream);

        const detail = status === httpStatusCodes.TOO_MANY_REQUESTS ? "hit its usage limit" : reason;

        getLogger().warn(
            `AI model ${spec.id} ${detail} on key ${keyIdx + 1}${note}. Cooling down for ${Util.shortDuration(delay)}.`
        );
    }

    async _requestWithKeys(spec, body, state, options, stream, deadline) {
        const keys = this._getProviderFor(spec).keys;

        for (let i = 0; i < keys.length; i++) {
            const keyId = getKeyId(spec, i);

            if (state.failed.has(keyId) || this.rejectedKeys.has(getProviderKeyId(spec.provider, i))) {
                continue;
            }

            const release = this.quotas.acquire(keyId);

            if (release === null) {
                continue;
            }

            let recovered = false;

            try {
                if (Util.getRemainingTime(deadline) === 0) {
                    throw new AIError("Ran out of time");
                }

                const attempt = await this._tryRequest(spec, i, body, state, options, stream, deadline);

                if (attempt === null) {
                    this._fail(state, spec, i, stream, "took too long to respond", {
                        status: httpStatusCodes.REQUEST_TIMEOUT
                    });
                } else {
                    const { res, out } = attempt;

                    if (out === null) {
                        if (!canFallback(res.status)) {
                            throw this._createError(spec, res);
                        }

                        this._fail(state, spec, i, stream, `is unavailable (HTTP ${res.status})`, res);
                        continue;
                    }

                    addUsage(state, spec.id, out.usage);

                    if (!stream || out.finishReason !== null) {
                        if (!state.models.includes(spec.id)) {
                            state.models.push(spec.id);
                        }

                        recovered = true;
                        return out;
                    }

                    const { error } = out,
                        failure = typeof error?.code === "number" ? { status: error.code, data: { error } } : null;
                    this._fail(state, spec, i, stream, "stopped mid-answer", failure);
                }

                if (stream) {
                    await options.onRestart();
                }
            } finally {
                release(recovered, stream);
            }
        }

        return null;
    }

    _createError(spec, res) {
        const provider = this._getProviderFor(spec),
            message = this.redactLogText(provider.getErrorMessage(res));

        return new AIError(`${spec.id}: HTTP ${res.status} ${message}`.trim(), {
            model: spec.id,
            status: res.status
        });
    }

    _getRetryInfo(state) {
        let soonest = null,
            rejectedStatus = null;

        for (const spec of this.models) {
            const { keys } = this._getProviderFor(spec);

            for (const [i] of keys.entries()) {
                const rejected = this.rejectedKeys.get(getProviderKeyId(spec.provider, i));

                if (typeof rejected !== "undefined") {
                    rejectedStatus ??= rejected;
                    continue;
                }

                const limit = this.quotas.getActive(getKeyId(spec, i));

                if (limit === null) {
                    const status = isKeyRejected(state.lastStatus) ? null : state.lastStatus;
                    return { status, retryIn: 0 };
                } else if (soonest === null || limit.until < soonest.until) {
                    soonest = limit;
                }
            }
        }

        return soonest === null
            ? { status: rejectedStatus, retryIn: 0 }
            : { status: soonest.status, retryIn: Math.max(0, soonest.until - Date.now()) };
    }

    async _send(body, state, options, stream) {
        options = ObjectUtil.guaranteeObject(options);

        const deadline = Util.createDeadline(options.timeLeft);

        for (; state.modelIdx < this.models.length; state.modelIdx++) {
            const spec = this.models[state.modelIdx],
                res = await this._requestWithKeys(spec, body, state, options, stream, deadline);

            if (res !== null) {
                return res;
            }
        }

        throw new AIError("All models are unavailable right now", this._getRetryInfo(state));
    }
}

export default ModelRouter;
