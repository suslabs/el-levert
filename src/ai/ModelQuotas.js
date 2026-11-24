class ModelQuotas {
    constructor(fallbackDelay, maxFallbackDelay) {
        this.fallbackDelay = fallbackDelay;
        this.maxFallbackDelay = maxFallbackDelay;

        this.limits = new Map();
    }

    getTimeLeft(id) {
        const limit = this.limits.get(id);
        return typeof limit === "undefined" ? 0 : Math.max(limit.until - Date.now(), 0);
    }

    isLimited(id) {
        return this.getTimeLeft(id) > 0;
    }

    limit(id, retryDelay = null) {
        const hits = (this.limits.get(id)?.hits ?? 0) + 1,
            delay = retryDelay ?? Math.min(this.fallbackDelay * 2 ** (hits - 1), this.maxFallbackDelay);

        this.limits.set(id, { hits, until: Date.now() + delay });
        return delay;
    }

    reset(id) {
        this.limits.delete(id);
    }
}

export default ModelQuotas;
