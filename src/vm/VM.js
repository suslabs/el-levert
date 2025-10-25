import Util from "../util/Util.js";

import VMError from "../errors/VMError.js";

class VM {
    static VMname = "vm";

    constructor(enabled, options) {
        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new VMError("VM must have a name");
        } else if (typeof this.runScript !== "function") {
            throw new VMError("Child class must have a runScript function");
        }

        this.enabled = enabled;

        this.options = options;

        this._childLoad = this.load;
        this.load = this._load.bind(this);

        this._childUnload = this.unload;
        this.unload = this._unload.bind(this);

        this._childRunScript = this.runScript;
        this.runScript = this._runScript.bind(this);
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

    _runScript(code, ...args) {
        if (!this.enabled) {
            const msg = typeof this.getDisabledMessage === "function" ? this.getDisabledMessage() : "VM is disabled";
            throw new VMError(msg);
        }

        return this._childRunScript.apply(this, [code].concat(args));
    }
}

export default VM;
