import VMError from "../errors/VMError.js";

function _load(...args) {
    if (!this.enabled) {
        return;
    }

    if (typeof this.childLoad !== "function") {
        return;
    }

    return this.childLoad(...args);
}

function _unload(...args) {
    if (!this.enabled) {
        return;
    }

    if (typeof this.childUnload !== "function") {
        return;
    }

    return this.childUnload(...args);
}

function _runScript(script, ...args) {
    if (!this.enabled) {
        if (typeof this.getDisabledMessage === "function") {
            return this.getDisabledMessage();
        }

        return;
    }

    return this.childRunScript(...args);
}

class VM {
    constructor(enabled, options) {
        if (typeof this.runScript !== "function") {
            throw new VMError("Child class must have a runScript function");
        }

        this.enabled = enabled;

        this.childLoad = this.load;
        this.load = _load.bind(this);

        this.childUnload = this.unload;
        this.unload = _unload.bind(this);

        this.childRunScript = this.runScript;
        this.runScript = _runScript.bind(this);
    }
}

export default VM;