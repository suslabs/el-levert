import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

class Benchmark {
    static data = Object.create(null);
    static counts = Object.create(null);
    static timepoints = new Map();

    static maxTimepointAge = 5 * 60 * 1000;

    static getCurrentTime(ms = true) {
        const time = performance.now();
        return ms ? Math.floor(time) : time;
    }

    static startTiming(key) {
        key = this._formatTimeKey(key);

        const t1 = this.getCurrentTime(false);
        this.timepoints.set(key, t1);

        this._startSweepLoop();
        return key;
    }

    static restartTiming(key) {
        key = this._formatTimeKey(key);
        let t0 = this.data[key];

        if (typeof t0 === "undefined") {
            return this.startTiming(key);
        }

        delete this.data[key];

        const t1 = this.getCurrentTime(false);
        this.timepoints.set(key, t1 - t0);

        this._startSweepLoop();
        return key;
    }

    static stopTiming(key, save = true) {
        key = this._formatTimeKey(key);

        if (save === null) {
            this.timepoints.delete(key);
            if (this.timepoints.size < 1) {
                this._stopSweepLoop();
            }
            return NaN;
        }

        const t1 = this.timepoints.get(key);
        if (typeof t1 === "undefined") {
            return NaN;
        }

        this.timepoints.delete(key);
        if (this.timepoints.size < 1) {
            this._stopSweepLoop();
        }

        const t2 = this.getCurrentTime(false),
            dt = t2 - t1;

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

        return typeof time === "undefined"
            ? `Key "${this._formatDisplayKey(key)}" not found.`
            : this._formatTime(key, time);
    }

    static deleteTime(key) {
        key = this._formatTimeKey(key);
        this.timepoints.delete(key);
        if (this.timepoints.size < 1) {
            this._stopSweepLoop();
        }

        if (key in this.data) {
            delete this.data[key];
            return true;
        }

        return false;
    }

    static clear() {
        for (const key of Reflect.ownKeys(this.data)) {
            delete this.data[key];
        }

        this.timepoints.clear();
        this._stopSweepLoop();
        this.clearCounts();
    }

    static clearExcept(...keys) {
        const clearKeys = Reflect.ownKeys(this.data).filter(key => !keys.includes(key));

        for (const key of clearKeys) {
            delete this.data[key];
        }

        this.timepoints.clear();
        this._stopSweepLoop();
        this.clearCounts();
    }

    static clearExceptLast(n = 1) {
        const clearKeys = Reflect.ownKeys(this.data).slice(0, -n);

        for (const key of clearKeys) {
            delete this.data[key];
        }

        this.timepoints.clear();
        this._stopSweepLoop();
        this.clearCounts();
    }

    static getSum(...keys) {
        let sumTimes = [];

        if (keys.length > 0) {
            sumTimes = keys
                .map(key => {
                    key = this._formatTimeKey(key);
                    return this.data[key];
                })
                .filter(time => typeof time !== "undefined");
        } else {
            sumTimes = Reflect.ownKeys(this.data).map(key => this.data[key]);
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

        let useSum = includeSum.length > 0,
            sum;

        if (useSum) {
            const allKeys = includeSum[0] === true,
                keys = allKeys ? [] : includeSum;

            sum = this.getSum(...keys);
        }

        if (format) {
            const times = Reflect.ownKeys(this.data).map(key => this._formatTime(key, this.data[key]));
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
        const displayName = this._formatDisplayKey(name);
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

        if (name in this.counts) {
            this.counts[name] = 0;
            return true;
        }

        return false;
    }

    static deleteCount(name) {
        name = this._formatCountName(name);

        if (name in this.counts) {
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

        const timeKey = this._formatCount(originalName, count);
        this.deleteTime(timeKey);

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
            _this.startTiming(_this.getCount(name));

            try {
                return func.apply(this, args);
            } finally {
                _this.stopTiming(_this.getCount(name));
            }
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

        const minText = Math.round(min * 1000).toLocaleString(),
            maxText = Math.round(max * 1000).toLocaleString();

        const avgText = Math.round(avg * 1000).toLocaleString(),
            sumText = Util.round(sum / 1000, 3);

        console.log(
            `${name} - ${runs} runs | min: ${minText}us | max: ${maxText}us | avg: ${avgText}us | total: ${sumText}s`
        );

        return [min, max, avg, sum, result];
    }

    static _origCountNames = new Map();
    static _origCountFuncs = new Map();

    static _formatTime(key, time) {
        return `${this._formatDisplayKey(key)}: ${time.toLocaleString()}ms`;
    }

    static _formatTimeKey(key) {
        switch (typeof key) {
            case "number":
                return key.toString();
            case "string":
                return key;
            case "symbol":
                return key;
            default:
                throw new UtilError("Time keys must be strings, numbers, or symbols");
        }
    }

    static _formatDisplayKey(key) {
        return typeof key === "symbol" ? (key.description ?? "") : String(key);
    }

    static _formatCount(name, count) {
        return `${name}_${count}`;
    }

    static _formatCountInput(name) {
        switch (typeof name) {
            case "string":
                return name;
            case "number":
                return name.toString();
            case "symbol":
                return name.description ?? "";
            default:
                throw new UtilError("Count names must be strings, numbers, or symbols");
        }
    }

    static _formatCountOrigName(name) {
        name = this._formatCountInput(name);
        name = name.replaceAll(" ", "_");
        return name.toLowerCase();
    }

    static _formatCountName(name) {
        name = this._formatCountInput(name);

        name = name.replaceAll(" ", "_");
        name += "_count";

        return name.toUpperCase();
    }

    static _timepointSweepInterval = 30 * 1000;
    static _timepointSweepTimer = null;

    static _sweepTimepoints() {
        const now = this.getCurrentTime(false);

        for (const [key, t1] of this.timepoints.entries()) {
            if (now - t1 > this.maxTimepointAge) {
                this.timepoints.delete(key);
            }
        }

        if (this.timepoints.size < 1) {
            this._stopSweepLoop();
        }
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
