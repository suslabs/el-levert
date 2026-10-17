import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import ObjectUtil from "../ObjectUtil.js";

import UtilError from "../../errors/UtilError.js";

class RateLimiter {
    static defaultKey = "default";

    static defaultValues = {
        maxRequests: Infinity,
        window: 1000,
        sweepInterval: 0
    };

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    constructor(maxRequests, window, options) {
        if (TypeTester.isObject(maxRequests)) {
            options = maxRequests;
            maxRequests = options.maxRequests;
            window = options.window;
        }

        options = ObjectUtil.guaranteeObject(options);

        if (maxRequests != null) {
            options.maxRequests = maxRequests;
        }

        if (window != null) {
            options.window = window;
        }

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        this.items = new Map();
        this._sweepTimer = null;

        if (this.sweepInterval > 0) {
            this._startSweepLoop();
        }
    }

    get size() {
        return this.items.size;
    }

    get remaining() {
        return this.getRemaining(RateLimiter.defaultKey);
    }

    get count() {
        return this.getCount(RateLimiter.defaultKey);
    }

    has(key) {
        const id = RateLimiter._getId(key);
        return this.items.has(id);
    }

    hasItem(key) {
        return this.has(key);
    }

    findItem(key) {
        const id = RateLimiter._getId(key);
        return this.items.get(id) ?? null;
    }

    getItem(key) {
        return this.findItem(key);
    }

    getRemaining(key, now) {
        const [id, time] = this._resolveArgs(key, now);

        this._pruneBucket(id, time);

        const bucket = this.items.get(id);

        const count = bucket?.length ?? 0;
        return Math.max(0, this.maxRequests - count);
    }

    getCount(key, now) {
        const [id, time] = this._resolveArgs(key, now);

        this._pruneBucket(id, time);

        const bucket = this.items.get(id);
        return bucket?.length ?? 0;
    }

    getTimeToReset(key, now) {
        const [id, time] = this._resolveArgs(key, now);

        this._pruneBucket(id, time);

        const bucket = this.items.get(id);

        if (typeof bucket === "undefined" || bucket.length < this.maxRequests) {
            return 0;
        }

        const oldest = Util.first(bucket);
        return Math.max(0, oldest + this.window - time);
    }

    canRequest(key, now) {
        const [id, time] = this._resolveArgs(key, now);

        this._pruneBucket(id, time);

        const bucket = this.items.get(id),
            count = bucket?.length ?? 0;

        return count < this.maxRequests;
    }

    check(key, now) {
        const [id, time] = this._resolveArgs(key, now);

        this._pruneBucket(id, time);
        let bucket = this.items.get(id);

        if (typeof bucket === "undefined") {
            bucket = [];
            this.items.set(id, bucket);
        }

        if (bucket.length >= this.maxRequests) {
            return false;
        }

        bucket.push(time);
        return true;
    }

    execute(key, func) {
        if (typeof key === "function") {
            func = key;
            key = RateLimiter.defaultKey;
        }

        if (typeof func !== "function") {
            throw new UtilError("Function must be provided to execute");
        } else if (!this.check(key)) {
            return false;
        }

        return func();
    }

    wrap(key, func) {
        if (typeof key === "function") {
            func = key;
            key = RateLimiter.defaultKey;
        }

        if (typeof func !== "function") {
            throw new UtilError("Function must be provided to wrap");
        }

        const _this = this;

        return function (...args) {
            if (!_this.check(key)) {
                return null;
            }

            return func.apply(this, args);
        };
    }

    prune(key, now) {
        if (typeof key === "number" && typeof now === "undefined") {
            now = key;
            key = null;
        }

        const time = typeof now === "number" ? now : Date.now();

        if (key != null) {
            const id = RateLimiter._getId(key);
            this._pruneBucket(id, time);
            return;
        }

        for (const id of this.items.keys()) {
            this._pruneBucket(id, time);
        }
    }

    reset(key) {
        if (key == null) {
            return this.clear();
        }

        const id = RateLimiter._getId(key);
        return this.items.delete(id);
    }

    removeItem(key) {
        const id = RateLimiter._getId(key),
            bucket = this.items.get(id) ?? null;

        if (bucket === null) {
            return null;
        }

        this.items.delete(id);
        return bucket;
    }

    clear() {
        this.items.clear();
        return true;
    }

    clearItems() {
        return this.clear();
    }

    destroy() {
        this._stopSweepLoop();
        this.clear();
    }

    static _getId(target) {
        if (TypeTester.isObject(target)) {
            return target.id ?? target;
        }

        return target;
    }

    _resolveArgs(key, now) {
        if (typeof key === "number" && typeof now === "undefined") {
            return [RateLimiter.defaultKey, key];
        }

        const id = RateLimiter._getId(key) ?? RateLimiter.defaultKey,
            time = typeof now === "number" ? now : Date.now();

        return [id, time];
    }

    _pruneBucket(id, now) {
        const bucket = this.items.get(id);

        if (typeof bucket === "undefined") {
            return;
        }

        const threshold = now - this.window,
            filtered = bucket.filter(t => t > threshold);

        if (Util.empty(filtered)) {
            this.items.delete(id);
        } else {
            this.items.set(id, filtered);
        }
    }

    _sweepItems = () => {
        const now = Date.now();

        for (const id of this.items.keys()) {
            this._pruneBucket(id, now);
        }
    };

    _startSweepLoop() {
        if (this._sweepTimer !== null) {
            this._stopSweepLoop();
        }

        this._sweepTimer = setInterval(this._sweepItems, this.sweepInterval);
    }

    _stopSweepLoop() {
        if (this._sweepTimer === null) {
            return;
        }

        clearInterval(this._sweepTimer);
        this._sweepTimer = null;
    }
}

export default RateLimiter;
