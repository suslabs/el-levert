import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";
import IntervalLoop from "./IntervalLoop.js";

function shouldEnableSweep(options, sweepInterval) {
    return (options.enableSweep ?? true) && sweepInterval > 0;
}

class TimedStore {
    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        this.items = new Map();

        this.sweepInterval = options.sweepInterval ?? 0;
        this.enableSweep = shouldEnableSweep(options, this.sweepInterval);

        this._childSweepItems = this.sweepItems;
        this.sweepItems = this._sweepItems.bind(this);

        let loop = null;

        if (this.enableSweep) {
            loop = new IntervalLoop(
                () => this.sweepItems(),
                this.sweepInterval,
                err => this._onSweepError(err)
            );

            loop.start();
        }

        this._sweepLoop = loop;
    }

    get size() {
        return this.items.size;
    }

    has(key) {
        return this.findItem(key) !== null;
    }

    hasItem(key) {
        return this.has(key);
    }

    findItem(key) {
        const id = this.constructor._getId(key);

        if (id == null) {
            return null;
        }

        return this.items.get(id) ?? null;
    }

    getItem(key) {
        return this.findItem(key);
    }

    removeItem(key) {
        const item = this.findItem(key);

        if (item === null) {
            return null;
        }

        const id = this.constructor._getId(key);
        this.items.delete(id);

        return item;
    }

    clear() {
        this.items.clear();
        return true;
    }

    clearItems() {
        return this.clear();
    }

    destroy() {
        const stopped = this._sweepLoop?.stop();

        this.clear();
        return stopped;
    }

    static _getId(target) {
        if (TypeTester.isObject(target)) {
            return target.id ?? target;
        }

        return target;
    }

    _onSweepError() {}

    _sweepItems(...args) {
        if (!this.enableSweep) {
            return;
        }

        if (typeof this._childSweepItems === "function") {
            return this._childSweepItems.apply(this, args);
        }
    }
}

export default TimedStore;
