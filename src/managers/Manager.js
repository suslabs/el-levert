import ManagerError from "../errors/ManagerError.js";

function _load(...args) {
    if (!this.enabled) {
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

class Manager {
    constructor(enabled = true, options = {}) {
        if (typeof this.constructor.$name === "undefined") {
            throw new ManagerError("Manager must have a name");
        }

        if (typeof this.load !== "function") {
            throw new ManagerError("Child class must have a load function");
        }

        this.enabled = enabled;

        this.options = options;

        this.childLoad = this.load;
        this.load = _load.bind(this);

        this.childUnload = this.unload;
        this.unload = _unload.bind(this);
    }
}

export default Manager;
