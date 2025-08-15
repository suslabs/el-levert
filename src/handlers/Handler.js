import HandlerError from "../errors/HandlerError.js";

import Util from "../util/Util.js";

class Handler {
    constructor(enabled = true, options = {}) {
        if (typeof this.constructor.$name !== "string") {
            throw new HandlerError("Handler must have a name");
        }

        if (typeof this.execute !== "function") {
            throw new HandlerError("Child class must have an execute function");
        }

        this.enabled = enabled;

        this.options = options;

        this.priority ??= options.priority ?? 0;
        this.minResponseTime = options.minResponseTime ?? 0;

        this._childLoad = this.load;
        this.load = this._load;

        this._childUnload = this.unload;
        this.unload = this._unload;

        this._childExecute = this.execute;
        this.execute = this._execute;

        this._childDelete = this.delete;
        this.delete = this._delete;

        this._childResubmit = this.resubmit;
        this.resubmit = this._resubmit;
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

        let deleteFunc;

        if (typeof this._childDelete === "function") {
            deleteFunc = this._childDelete;
        } else {
            deleteFunc = this._defaultDelete;
        }

        return deleteFunc.apply(this, args);
    }

    _defaultDelete() {
        return false;
    }

    _resubmit(...args) {
        if (!this.enabled) {
            return false;
        }

        let resubmitFunc;

        if (typeof this._childResubmit === "function") {
            resubmitFunc = this._childResubmit;
        } else {
            resubmitFunc = this._defaultResubmit;
        }

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

        if (typeof this._childLoad !== "function") {
            return;
        }

        return this._childLoad.apply(this, args);
    }

    _unload(...args) {
        if (!this.enabled) {
            return;
        }

        if (typeof this._childUnload !== "function") {
            return;
        }

        return this._childUnload.apply(this, args);
    }

    async _addDelay(t1, delta = false) {
        if (this.minResponseTime <= 0) {
            return;
        }

        if (isNaN(t1) || t1 <= 0) {
            return await Util.delay(this.minResponseTime);
        }

        let time;

        if (delta) {
            time = t1;
        } else {
            const t2 = performance.now();
            time = Util.timeDelta(t2, t1);
        }

        if (time < this.minResponseTime) {
            const delay = this.minResponseTime - time;
            await Util.delay(delay);
        }
    }
}

export default Handler;
