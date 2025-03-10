import VMError from "../errors/VMError.js";

class VM {
    constructor(enabled, options) {
        if (typeof this.constructor.$name === "undefined") {
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

        return this._childLoad(...args);
    }

    _unload(...args) {
        if (!this.enabled) {
            return;
        }

        if (typeof this._childUnload !== "function") {
            return;
        }

        return this._childUnload(...args);
    }

    _runScript(code, ...args) {
        if (!this.enabled) {
            if (typeof this.getDisabledMessage === "function") {
                return this.getDisabledMessage();
            }

            return;
        }

        return this._childRunScript(code, ...args);
    }
}

export default VM;
