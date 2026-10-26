import { AsyncLocalStorage } from "node:async_hooks";

import Util from "../Util.js";
import CaseUtil from "./CaseUtil.js";

import UtilError from "../../errors/UtilError.js";

class Benchmark {
    static data = Object.create(null);
    static counts = Object.create(null);

    static maxTimepointAge = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;

    static get timepoints() {
        return this._getCurrentStore().timepoints;
    }

    static getCurrentTime(ms = true) {
        const time = performance.now();
        return ms ? Math.floor(time) : time;
    }

    static startTiming(key) {
        key = this._formatTimeKey(key);

        const t1 = this.getCurrentTime(false),
            store = this._getStartStore(key, t1);

        this._setStore(store);
        return key;
    }

    static restartTiming(key) {
        key = this._formatTimeKey(key);
        let t0 = this.data[key];

        if (typeof t0 === "undefined") {
            return this.startTiming(key);
        }

        delete this.data[key];

        const t1 = this.getCurrentTime(false),
            store = this._getStartStore(key, t1 - t0);

        this._setStore(store);
        return key;
    }

    static stopTiming(key, save = true) {
        key = this._formatTimeKey(key);

        const store = this._getCurrentStore();

        if (save === null) {
            this._deleteCurrentTimepoint(store, key);

            return NaN;
        }

        const timepoint = this._getTimepoint(store, key);

        if (timepoint === null) {
            return NaN;
        }

        this._deleteCurrentTimepoint(store, key, timepoint.owner);

        const t2 = this.getCurrentTime(false),
            dt = t2 - timepoint.t1;

        const ms = Math.floor(dt);

        if (save) {
            this.data[key] = ms;
        }

        return ms;
    }

    static getTime(key, format = true) {
        key = this._formatTimeKey(key);
        const time = this.data[key];

        if (!format) {
            return time ?? NaN;
        }

        return typeof time === "undefined" ? `Key "${key}" not found.` : this._formatTime(key, time);
    }

    static deleteTime(key) {
        key = this._formatTimeKey(key);

        this._deleteCurrentTimepoint(this._getCurrentStore(), key);

        if (Object.hasOwn(this.data, key)) {
            delete this.data[key];
            return true;
        }

        return false;
    }

    static clear() {
        for (const key of Object.keys(this.data)) {
            delete this.data[key];
        }

        this._resetTimepoints();
        this.clearCounts();
    }

    static clearExcept(...keys) {
        keys = keys.map(key => this._formatTimeKey(key));

        const clearKeys = Object.keys(this.data).filter(key => !keys.includes(key));

        for (const key of clearKeys) {
            delete this.data[key];
        }

        this._resetTimepoints();
        this.clearCounts();
    }

    static clearExceptLast(n = 1) {
        const clearKeys = Object.keys(this.data).slice(0, -n);

        for (const key of clearKeys) {
            delete this.data[key];
        }

        this._resetTimepoints();
        this.clearCounts();
    }

    static getSum(...keys) {
        let sumTimes = [];

        if (!Util.empty(keys)) {
            sumTimes = keys
                .map(key => {
                    key = this._formatTimeKey(key);
                    return this.data[key];
                })
                .filter(time => typeof time !== "undefined");
        } else {
            sumTimes = Object.values(this.data);
        }

        return sumTimes.reduce((a, b) => a + b, 0);
    }

    static getAll(...includeSum) {
        let format = Util.last(includeSum);

        if (typeof format === "boolean") {
            includeSum.pop();
        } else {
            format = true;
        }

        let useSum = !Util.empty(includeSum),
            sum;

        if (useSum) {
            const allKeys = includeSum[0] === true,
                keys = allKeys ? [] : includeSum;

            sum = this.getSum(...keys);
        }

        if (format) {
            const times = Object.entries(this.data).map(([key, time]) => this._formatTime(key, time));

            if (useSum) {
                times.push(this._formatTime("sum", sum));
            }

            return times.join(",\n");
        } else {
            const times = Object.assign({}, this.data);

            if (useSum) {
                times.sum = sum;
            }

            return times;
        }
    }

    static defineCount(name) {
        const originalName = this._formatCountOrigName(name);
        name = this._formatCountName(name);

        if (typeof this.counts[name] !== "undefined") {
            return;
        }

        this.counts[name] = 0;
        this._origCountNames.set(name, originalName);
    }

    static getCount(name, format = true) {
        const displayName = name;

        name = this._formatCountName(name);
        const count = this.counts[name];

        if (!format) {
            return count ?? NaN;
        }

        const originalName = this._origCountNames.get(name);

        if (typeof count === "undefined" || typeof originalName === "undefined") {
            return `Count "${displayName}" not found.`;
        } else {
            return this._formatCount(originalName, count);
        }
    }

    static incrementCount(name) {
        this.defineCount(name);
        name = this._formatCountName(name);

        this.counts[name]++;
        return this.counts[name];
    }

    static resetCount(name) {
        name = this._formatCountName(name);

        if (Object.hasOwn(this.counts, name)) {
            this.counts[name] = 0;
            return true;
        }

        return false;
    }

    static deleteCount(name) {
        name = this._formatCountName(name);

        if (Object.hasOwn(this.counts, name)) {
            delete this.counts[name];
            this._origCountNames.delete(name);
            this._origCountFuncs.delete(name);

            return true;
        }

        return false;
    }

    static deleteLastCountTime(name) {
        name = this._formatCountName(name);

        const count = this.counts[name],
            originalName = this._origCountNames.get(name);

        if (typeof count === "undefined" || typeof originalName === "undefined" || count < 1) {
            return false;
        }

        const key = this._formatCount(originalName, count);
        this.deleteTime(key);

        this.counts[name]--;
        return true;
    }

    static clearCounts() {
        for (const name of Object.keys(this.counts)) {
            this.counts[name] = 0;
        }
    }

    static wrapFunction(name, func) {
        const formattedName = this._formatCountName(name);

        this.defineCount(name);
        this._origCountFuncs.set(formattedName, func);

        const _this = this;
        return function (...args) {
            _this.incrementCount(name);

            const key = _this.getCount(name);
            _this.startTiming(key);

            let res = null;

            try {
                res = func.apply(this, args);
            } catch (err) {
                _this.stopTiming(key);
                throw err;
            }

            return Util.maybeAsyncThen(
                res,
                out => {
                    _this.stopTiming(key);
                    return out;
                },
                err => {
                    _this.stopTiming(key);
                    throw err;
                }
            );
        };
    }

    static removeWrapper(name) {
        const formattedName = this._formatCountName(name);

        if (typeof this.counts[formattedName] === "undefined") {
            return `Wrapper "${this._formatDisplayKey(name)}" not found.`;
        }

        const originalFunc = this._origCountFuncs.get(formattedName);
        this.deleteCount(name);

        return originalFunc;
    }

    static runFunction(name, runs, func, ...args) {
        let result = null;

        let min = Number.MAX_VALUE,
            max = 0,
            sum = 0;

        for (let i = 1; i <= runs; i++) {
            const t1 = performance.now(),
                out = func(...args);

            const t2 = performance.now(),
                elapsed = Util.timeDelta(t2, t1);

            if (result === null) {
                result = out;
            }

            min = Math.min(min, elapsed);
            max = Math.max(max, elapsed);
            sum += elapsed;
        }

        const avg = sum / runs;

        const minText = Math.round(min / Util.durationSeconds.milli).toLocaleString(),
            maxText = Math.round(max / Util.durationSeconds.milli).toLocaleString();

        const avgText = Math.round(avg / Util.durationSeconds.milli).toLocaleString(),
            sumText = Util.duration(sum, {
                unit: "second",
                format: true,
                short: true,
                digits: 3
            });

        console.log(
            `${name} - ${runs} runs | min: ${minText}us | max: ${maxText}us | avg: ${avgText}us | total: ${sumText}`
        );

        return [min, max, avg, sum, result];
    }

    static _origCountNames = new Map();
    static _origCountFuncs = new Map();

    static _timepointStore = new AsyncLocalStorage();
    static _activeTimepoints = new Set();

    static _generation = 0;
    static _defaultTimepoints = {
        deleted: new Set(),
        parent: null,
        generation: 0,
        timepoints: new Map()
    };

    static _timepointSweepInterval = 30 / Util.durationSeconds.milli;
    static _timepointSweepTimer = null;

    static _formatTime(key, time) {
        return `${key}: ${time.toLocaleString()}ms`;
    }

    static _formatTimeKey(key) {
        if (typeof key !== "string") {
            throw new UtilError("Time keys must be strings");
        }

        return key;
    }

    static _formatCount(name, count) {
        return `${name}_${count}`;
    }

    static _formatCountInput(name) {
        if (typeof name !== "string") {
            throw new UtilError("Count names must be strings");
        }

        return name;
    }

    static _formatCountOrigName(name) {
        name = this._formatCountInput(name);
        return CaseUtil.toSnakeCase(name);
    }

    static _formatCountName(name) {
        name = this._formatCountInput(name);
        return CaseUtil.toSnakeCase(`${name}_count`, true);
    }

    static _getCurrentStore() {
        const store = this._timepointStore.getStore();

        if (store?.generation === this._generation) {
            return store;
        }

        return this._defaultTimepoints;
    }

    static _setStore(store) {
        this._syncTimepoints(store);
        this._timepointStore.enterWith(store);
    }

    static _makeStore(parent = null) {
        return {
            deleted: new Set(),
            parent,
            generation: this._generation,
            timepoints: new Map()
        };
    }

    static _syncTimepoints(store) {
        if (store.generation !== this._generation || store.timepoints.size < 1) {
            this._activeTimepoints.delete(store);
        } else {
            this._activeTimepoints.add(store);
        }

        if (this._activeTimepoints.size < 1) {
            this._stopSweepLoop();
        } else {
            this._startSweepLoop();
        }
    }

    static _resetTimepoints() {
        this._generation++;
        this._defaultTimepoints = this._makeStore();

        this._activeTimepoints.clear();
        this._stopSweepLoop();
    }

    static _sweepTimepoints() {
        const now = this.getCurrentTime(false);

        for (const store of this._activeTimepoints) {
            if (store.generation !== this._generation) {
                this._activeTimepoints.delete(store);
                continue;
            }

            for (const [key, t1] of store.timepoints.entries()) {
                if (now - t1 > this.maxTimepointAge) {
                    store.timepoints.delete(key);
                }
            }

            this._syncTimepoints(store);
        }
    }

    static _getStartStore(key, t1) {
        const store = this._getCurrentStore();

        if (this._getTimepoint(store, key) !== null) {
            const child = this._makeStore(store);

            child.timepoints.set(key, t1);
            return child;
        }

        store.deleted.delete(key);
        store.timepoints.set(key, t1);

        return store;
    }

    static _getTimepoint(store, key) {
        while (store !== null && store.generation === this._generation) {
            if (store.deleted.has(key)) {
                return null;
            }

            if (store.timepoints.has(key)) {
                return {
                    owner: store,
                    t1: store.timepoints.get(key)
                };
            }

            store = store.parent;
        }

        return null;
    }

    static _deleteCurrentTimepoint(store, key, owner) {
        owner ??= this._getTimepoint(store, key)?.owner ?? null;

        if (owner === null) {
            this._syncTimepoints(store);
            return;
        }

        if (owner === store) {
            store.timepoints.delete(key);
        } else {
            store.deleted.add(key);
        }

        this._syncTimepoints(store);
    }

    static _startSweepLoop() {
        if (this._timepointSweepTimer !== null) {
            return;
        }

        this._timepointSweepTimer = setInterval(() => this._sweepTimepoints(), this._timepointSweepInterval);
    }

    static _stopSweepLoop() {
        if (this._timepointSweepTimer === null) {
            return;
        }

        clearInterval(this._timepointSweepTimer);
        this._timepointSweepTimer = null;
    }
}

export default Benchmark;
