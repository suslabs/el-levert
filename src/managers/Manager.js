import Util from "../util/Util.js";

import ManagerError from "../errors/ManagerError.js";

class Manager {
    constructor(enabled = true, options = {}) {
        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new ManagerError("Manager must have a name");
        } else if (typeof this.load !== "function") {
            throw new ManagerError("Child class must have a load function");
        }

        this.enabled = enabled;

        this.options = options;

        this._childLoad = this.load;
        this.load = this._load.bind(this);

        this._childUnload = this.unload;
        this.unload = this._unload.bind(this);
    }

    _load(...args) {
        if (!this.enabled) {
            return;
        }

        return this._childLoad.apply(this, args);
    }

    _unload(...args) {
        if (!this.enabled) {
            return;
        }

        if (typeof this._childUnload === "function") {
            return this._childUnload.apply(this, args);
        }
    }
}

export default Manager;
