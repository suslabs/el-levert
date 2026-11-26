import Util from "../Util.js";
import BaseLimiter from "./BaseLimiter.js";

class RateLimiter extends BaseLimiter {
    static defaultValues = {
        maxRequests: Infinity,
        window: 1 / Util.durationSeconds.milli,
        sweepInterval: 0
    };

    constructor(maxRequests, window, options) {
        options = BaseLimiter.parseOptions([maxRequests, window], options, ["maxRequests", "window"]);

        const maxReq = options.maxRequests ?? RateLimiter.defaultValues.maxRequests,
            win = options.window ?? RateLimiter.defaultValues.window,
            unlimited = maxReq === -1 || win <= 0;

        if (unlimited) {
            options.enableSweep = false;
        }

        super(options);

        this.unlimited = unlimited;
    }

    get remaining() {
        return this.getRemaining(BaseLimiter.defaultKey);
    }

    get count() {
        return this.getCount(BaseLimiter.defaultKey);
    }

    getRemaining(key, now) {
        if (this.unlimited) {
            return -1;
        }

        const [id, time] = this._resolveArgs(key, now);

        this._pruneKey(id, time);

        const bucket = this.items.get(id),
            count = bucket?.length ?? 0;

        return Math.max(0, this.maxRequests - count);
    }

    getCount(key, now) {
        if (this.unlimited) {
            return 0;
        }

        const [id, time] = this._resolveArgs(key, now);

        this._pruneKey(id, time);

        const bucket = this.items.get(id);
        return bucket?.length ?? 0;
    }

    getTimeToReset(key, now) {
        if (this.unlimited) {
            return 0;
        }

        const [id, time] = this._resolveArgs(key, now);

        this._pruneKey(id, time);

        const bucket = this.items.get(id);

        if (typeof bucket === "undefined" || bucket.length < this.maxRequests) {
            return 0;
        }

        const oldest = Util.first(bucket);
        return Math.max(0, oldest + this.window - time);
    }

    canRequest(key, now) {
        if (this.unlimited) {
            return true;
        }

        const [id, time] = this._resolveArgs(key, now);

        this._pruneKey(id, time);

        const bucket = this.items.get(id),
            count = bucket?.length ?? 0;

        return count < this.maxRequests;
    }

    check(key, now) {
        if (this.unlimited) {
            return true;
        }

        const [id, time] = this._resolveArgs(key, now);

        this._pruneKey(id, time);
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

    _runGuarded(key, func, blockedValue) {
        return this.check(key) ? func() : blockedValue;
    }

    _pruneKey(id, now) {
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
}

export default RateLimiter;
