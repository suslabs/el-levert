import { getClient } from "../LevertClient.js";

import Util from "../util/Util.js";

import HandlerError from "../errors/HandlerError.js";

class Handler {
    constructor(enabled = true, options = {}) {
        const compName = this.constructor.$name;

        if (typeof compName !== "string" || Util.empty(compName)) {
            throw new HandlerError("Handler must have a name");
        } else if (typeof this.execute !== "function") {
            throw new HandlerError("Child class must have an execute function");
        }

        this.enabled = enabled;

        this.options = options;

        this.priority ??= options.priority ?? 0;

        const minResponseTime =
                options.minResponseTime == null ? getClient().config.minResponseTime : options.minResponseTime,
            invalidResponseTime = !Number.isFinite(minResponseTime) || minResponseTime <= 0;
        this.minResponseTime = invalidResponseTime ? -1 : Math.round(minResponseTime);

        const globalTimeLimit =
                options.globalTimeLimit == null ? getClient().config.globalTimeLimit : options.globalTimeLimit,
            invalidTimeLimit = !Number.isFinite(globalTimeLimit) || globalTimeLimit <= 0;
        this.globalTimeLimit = invalidTimeLimit ? -1 : Math.round(globalTimeLimit);

        this._childLoad = this.load;
        this.load = this._load.bind(this);

        this._childUnload = this.unload;
        this.unload = this._unload.bind(this);

        this._childExecute = this.execute;
        this.execute = this._execute.bind(this);

        this._childDelete = this.delete;
        this.delete = this._delete.bind(this);

        this._childResubmit = this.resubmit;
        this.resubmit = this._resubmit.bind(this);
    }

    reply(data) {}

    _execute(...args) {
        if (!this.enabled) {
            return false;
        }

        return this._childExecute.apply(this, args) ?? false;
    }

    _delete(...args) {
        if (!this.enabled) {
            return false;
        }

        const deleteFunc = typeof this._childDelete === "function" ? this._childDelete : this._defaultDelete;
        return deleteFunc.apply(this, args);
    }

    _defaultDelete() {
        return false;
    }

    _resubmit(...args) {
        if (!this.enabled) {
            return false;
        }

        const resubmitFunc = typeof this._childResubmit === "function" ? this._childResubmit : this._defaultResubmit;
        return resubmitFunc.apply(this, args);
    }

    async _defaultResubmit(...args) {
        let success = await this.delete(...args);
        success |= await this.execute(...args);

        return success;
    }

    _load(...args) {
        if (!this.enabled) {
            return;
        }

        if (typeof this._childLoad === "function") {
            return this._childLoad.apply(this, args);
        }
    }

    _unload(...args) {
        if (!this.enabled) {
            return;
        }

        if (typeof this._childUnload === "function") {
            return this._childUnload.apply(this, args);
        }
    }

    async _addDelay(t1, delta = true) {
        if (this.minResponseTime === -1) {
            return;
        }

        if (!Number.isFinite(t1) || t1 <= 0) {
            return await Util.delay(this.minResponseTime);
        }

        const t2 = performance.now(),
            elapsed = delta ? t1 : Util.timeDelta(t2, t1);

        if (elapsed < this.minResponseTime) {
            const delay = this.minResponseTime - elapsed;
            await Util.delay(delay);
        }
    }
}

export default Handler;
