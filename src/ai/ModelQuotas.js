import QuotaLimiter from "../util/misc/QuotaLimiter.js";

class ModelQuotas extends QuotaLimiter {
    limit(id, retryDelay = null, status = null, stream = false) {
        return super.limit(id, retryDelay, { status, stream: Boolean(stream) });
    }

    _canClear(item, recovered, stream = false) {
        if (!recovered) {
            return false;
        }

        return !item.stream || Boolean(stream);
    }
}

export default ModelQuotas;
