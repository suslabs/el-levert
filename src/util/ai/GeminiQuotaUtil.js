import Util from "../Util.js";

const GeminiQuotaUtil = Object.freeze({
    retryInfoType: "type.googleapis.com/google.rpc.RetryInfo",
    quotaFailureType: "type.googleapis.com/google.rpc.QuotaFailure",

    resetTimeZone: "America/Los_Angeles",

    _dailyQuotaRegex: /PerDay/i,
    _secondsRegex: /^([\d.]+)s$/,

    _findDetail: (error, type) => {
        return (error?.details ?? []).find(detail => detail["@type"] === type) ?? null;
    },

    isDailyLimit: error => {
        const failure = GeminiQuotaUtil._findDetail(error, GeminiQuotaUtil.quotaFailureType);
        return (failure?.violations ?? []).some(violation =>
            GeminiQuotaUtil._dailyQuotaRegex.test(violation.quotaId ?? "")
        );
    },

    getRetryDelay: error => {
        const match = GeminiQuotaUtil._findDetail(error, GeminiQuotaUtil.retryInfoType)?.retryDelay?.match(
            GeminiQuotaUtil._secondsRegex
        );

        return match == null ? null : Math.ceil(Number(match[1]) / Util.durationSeconds.milli);
    },

    getTimeToDailyReset: (date = new Date()) => {
        const formatter = new Intl.DateTimeFormat("en-US", {
            timeZone: GeminiQuotaUtil.resetTimeZone,
            hourCycle: "h23",
            hour: "numeric",
            minute: "numeric",
            second: "numeric"
        });

        const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, Number(part.value)])),
            elapsed =
                parts.hour * Util.durationSeconds.hour + parts.minute * Util.durationSeconds.minute + parts.second;

        return (Util.durationSeconds.day - elapsed) / Util.durationSeconds.milli;
    },

    getUnblockDelay: error => {
        if (GeminiQuotaUtil.isDailyLimit(error)) {
            return GeminiQuotaUtil.getTimeToDailyReset();
        }

        return GeminiQuotaUtil.getRetryDelay(error);
    }
});

export default GeminiQuotaUtil;
