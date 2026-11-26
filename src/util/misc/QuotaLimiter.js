import Util from "../Util.js";
import TypeTester from "../TypeTester.js";
import BaseLimiter from "./BaseLimiter.js";

function releaseUnrestricted() {}

class QuotaLimiter extends BaseLimiter {
    static defaultValues = {
        fallbackDelay: 1 / Util.durationSeconds.milli,
        maxFallbackDelay: Util.durationSeconds.minute / Util.durationSeconds.milli,
        sweepInterval: 0
    };

    constructor(fallbackDelay, maxFallbackDelay, options) {
        super(
            BaseLimiter.parseOptions([fallbackDelay, maxFallbackDelay], options, ["fallbackDelay", "maxFallbackDelay"])
        );
    }

    getActive(key, now) {
        const [id, time] = this._resolveArgs(key, now),
            item = this.items.get(id);

        if (typeof item === "undefined" || item.until <= time) {
            return null;
        }

        return item;
    }

    getTimeToReset(key, now) {
        const [id, time] = this._resolveArgs(key, now),
            item = this.items.get(id);

        if (typeof item === "undefined") {
            return 0;
        }

        return Math.max(0, item.until - time);
    }

    isLimited(key, now) {
        return this.getActive(key, now) !== null;
    }

    canRequest(key, now) {
        const [id, time] = this._resolveArgs(key, now),
            item = this.items.get(id);

        return typeof item === "undefined" || (item.until <= time && !item.probing);
    }

    limit(key, delay = null, data = null, now = Date.now()) {
        const id = this.constructor._getId(key) ?? BaseLimiter.defaultKey,
            current = this.items.get(id);

        const remaining = current ? current.until - now : 0;

        if (!Number.isFinite(delay) || delay <= 0) {
            delay = null;
        }

        if (remaining > 0 && (delay === null || delay <= remaining)) {
            return remaining;
        }

        const hits = (current?.hits ?? 0) + (remaining > 0 ? 0 : 1),
            resolvedDelay = delay ?? this._getBackoffDelay(hits);

        if (resolvedDelay <= 0) {
            if (remaining <= 0 && typeof current !== "undefined") {
                this.items.delete(id);
            }

            return 0;
        }

        const extra = TypeTester.isObject(data) ? data : null;

        this.items.set(id, { ...extra, hits, until: now + resolvedDelay, probing: false });
        return resolvedDelay;
    }

    acquire(key, now) {
        const [id, time] = this._resolveArgs(key, now),
            item = this.items.get(id);

        if (typeof item === "undefined") {
            return releaseUnrestricted;
        } else if (item.until > time || item.probing) {
            return null;
        }

        item.probing = true;

        let released = false;

        return (recovered = false, ...args) => {
            if (released) {
                return;
            }

            released = true;
            item.probing = false;

            if (this.items.get(id) === item && this._canClear(item, recovered, ...args)) {
                this.items.delete(id);
            }
        };
    }

    _getBackoffDelay(hits) {
        if (this.fallbackDelay <= 0) {
            return 0;
        }

        const delay = this.fallbackDelay * 2 ** (hits - 1);

        if (this.maxFallbackDelay === -1) {
            return delay;
        }

        return Math.min(delay, this.maxFallbackDelay);
    }

    _canClear(item, recovered) {
        return Boolean(recovered);
    }

    _runGuarded(key, func, blockedValue) {
        const release = this.acquire(key);

        if (release === null) {
            return blockedValue;
        }

        try {
            const res = func();

            if (TypeTester.isPromise(res)) {
                return res.then(
                    val => {
                        release(true);
                        return val;
                    },
                    err => {
                        release(false);
                        throw err;
                    }
                );
            }

            release(true);
            return res;
        } catch (err) {
            release(false);
            throw err;
        }
    }

    _pruneKey(id, now, keepBackoff = false) {
        const item = this.items.get(id);

        if (typeof item === "undefined" || item.probing) {
            return;
        }

        const grace = keepBackoff ? this._getBackoffDelay(item.hits) : 0;

        if (item.until + grace > now) {
            return;
        }

        this.items.delete(id);
    }
}

export default QuotaLimiter;
