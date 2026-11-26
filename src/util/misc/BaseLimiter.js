import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";
import TimedStore from "./TimedStore.js";

import UtilError from "../../errors/UtilError.js";

class BaseLimiter extends TimedStore {
    static defaultKey = "default";

    static defaultValues = {
        sweepInterval: 0
    };

    static parseOptions(values, options, props) {
        if (TypeTester.isObject(Util.first(values))) {
            return { ...Util.first(values) };
        }

        options = { ...ObjectUtil.guaranteeObject(options) };

        for (const [i, prop] of props.entries()) {
            if (values[i] != null) {
                options[prop] = values[i];
            }
        }

        return options;
    }

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);
        super(options);

        ObjectUtil.setValuesWithDefaults(
            this,
            options,
            this.constructor.defaultValues,
            key => key in this.constructor.defaultValues
        );
    }

    sweepItems() {
        const now = Date.now();

        for (const id of this.items.keys()) {
            this._pruneKey(id, now, true);
        }
    }

    prune(key, now) {
        if (typeof key === "number" && typeof now === "undefined") {
            now = key;
            key = null;
        }

        const time = typeof now === "number" ? now : Date.now();

        if (key != null) {
            const id = this.constructor._getId(key);
            this._pruneKey(id, time, false);
            return;
        }

        for (const id of this.items.keys()) {
            this._pruneKey(id, time, false);
        }
    }

    reset(key) {
        if (key == null) {
            return this.clear();
        }

        const id = this.constructor._getId(key);
        return this.items.delete(id);
    }

    execute(key, func) {
        [key, func] = BaseLimiter._parseCallArgs(key, func, "Function must be provided to execute");
        return this._runGuarded(key, func, false);
    }

    wrap(key, func) {
        [key, func] = BaseLimiter._parseCallArgs(key, func, "Function must be provided to wrap");

        const _this = this;

        return function (...args) {
            return _this._runGuarded(key, () => func.apply(this, args), null);
        };
    }

    static _parseCallArgs(key, func, errorMsg) {
        if (typeof key === "function") {
            func = key;
            key = BaseLimiter.defaultKey;
        }

        if (typeof func !== "function") {
            throw new UtilError(errorMsg);
        }

        return [key, func];
    }

    _resolveArgs(key, now) {
        if (typeof key === "number" && typeof now === "undefined") {
            return [BaseLimiter.defaultKey, key];
        }

        const id = this.constructor._getId(key) ?? BaseLimiter.defaultKey,
            time = typeof now === "number" ? now : Date.now();

        return [id, time];
    }

    _runGuarded() {
        return false;
    }

    _pruneKey() {}
}

export default BaseLimiter;
