class ModelQuotas {
    constructor(fallbackDelay, maxFallbackDelay) {
        this.fallbackDelay = fallbackDelay;
        this.maxFallbackDelay = maxFallbackDelay;

        this.limits = new Map();
    }

    getActive(id) {
        const limit = this.limits.get(id);

        return limit?.until > Date.now() ? limit : null;
    }

    acquire(id) {
        const limit = this.limits.get(id);

        if (typeof limit === "undefined") {
            return ModelQuotas._releaseUnrestricted;
        } else if (limit.until > Date.now() || limit.probing) {
            return null;
        }

        limit.probing = true;
        return stream => {
            limit.probing = false;

            // Successful triage must not clear a cooldown caused by a failed answer stream.
            if (stream === limit.stream && this.limits.get(id) === limit) {
                this.limits.delete(id);
            }
        };
    }

    limit(id, retryDelay = null, status = null, stream = null) {
        const now = Date.now();
        const current = this.limits.get(id);
        const remaining = (current?.until ?? now) - now;

        if (remaining > 0 && (retryDelay === null || retryDelay <= remaining)) {
            return remaining;
        }

        const hits = (current?.hits ?? 0) + (remaining > 0 ? 0 : 1),
            delay = retryDelay ?? Math.min(this.fallbackDelay * 2 ** (hits - 1), this.maxFallbackDelay);

        this.limits.set(id, { hits, until: now + delay, status, stream, probing: false });
        return delay;
    }

    static _releaseUnrestricted() {}
}

export default ModelQuotas;
