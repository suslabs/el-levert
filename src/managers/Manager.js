import ManagerError from "../errors/ManagerError.js";

class Manager {
    constructor(enabled = true, options = {}) {
        if (typeof this.constructor.$name !== "string") {
            throw new ManagerError("Manager must have a name");
        }

        if (typeof this.load !== "function") {
            throw new ManagerError("Child class must have a load function");
        }

        this.enabled = enabled;

        this.options = options;

        this._childLoad = this.load;
        this.load = this._load;

        this._childUnload = this.unload;
        this.unload = this._unload;
    }

    _load(...args) {
        if (!this.enabled) {
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
}

export default Manager;
