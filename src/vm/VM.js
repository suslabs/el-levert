import VMError from "../errors/VMError.js";

class VM {
    constructor(enabled, options) {
        if (typeof this.constructor.$name !== "string") {
            throw new VMError("VM must have a name");
        }

        if (typeof this.runScript !== "function") {
            throw new VMError("Child class must have a runScript function");
        }

        this.enabled = enabled;

        this.options = options;

        this._childLoad = this.load;
        this.load = this._load;

        this._childUnload = this.unload;
        this.unload = this._unload;

        this._childRunScript = this.runScript;
        this.runScript = this._runScript;
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

    _runScript(code, ...args) {
        if (!this.enabled) {
            let msg;

            if (typeof this.getDisabledMessage === "function") {
                msg = this.getDisabledMessage();
            } else {
                msg = "VM is disabled";
            }

            throw new VMError(msg);
        }

        return this._childRunScript.apply(this, [code].concat(args));
    }
}

export default VM;
