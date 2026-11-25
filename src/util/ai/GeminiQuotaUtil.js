import Util from "../Util.js";
import ArrayUtil from "../ArrayUtil.js";

const GeminiQuotaUtil = Object.freeze({
    retryInfoType: "type.googleapis.com/google.rpc.RetryInfo",
    quotaFailureType: "type.googleapis.com/google.rpc.QuotaFailure",

    _dailyQuotaRegex: /per[_ -]?day/i,
    _secondsRegex: /^(\d+(?:\.\d+)?)s$/,
    _retryMessageRegex: /\bplease retry in (\d+(?:\.\d+)?)s\b/i,

    _pacificTime: new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
    }),

    _findDetail: (error, type) => {
        const details = ArrayUtil.guaranteeArray(error?.details, null, true);
        return details.find(detail => detail?.["@type"] === type) ?? null;
    },

    isDailyLimit: error => {
        const failure = GeminiQuotaUtil._findDetail(error, GeminiQuotaUtil.quotaFailureType);
        return ArrayUtil.guaranteeArray(failure?.violations, null, true).some(violation =>
            GeminiQuotaUtil._dailyQuotaRegex.test(violation?.quotaId ?? "")
        );
    },

    getRetryDelay: error => {
        const retry = GeminiQuotaUtil._findDetail(error, GeminiQuotaUtil.retryInfoType)?.retryDelay;
        const match =
            GeminiQuotaUtil._secondsRegex.exec(retry) ?? GeminiQuotaUtil._retryMessageRegex.exec(error?.message);

        const delay = match === null ? 0 : Number(match[1]) / Util.durationSeconds.milli;
        return Number.isFinite(delay) && delay > 0 ? Math.ceil(delay) : null;
    },

    _getPacificWallTime: date => {
        const parts = GeminiQuotaUtil._pacificTime.formatToParts(date);
        const { year, month, day, hour, minute, second } = Object.fromEntries(
            parts.map(part => [part.type, Number(part.value)])
        );
        return Date.UTC(year, month - 1, day, hour, minute, second);
    },

    getTimeToDailyReset: (date = new Date()) => {
        const local = GeminiQuotaUtil._getPacificWallTime(date),
            midnight = new Date(local).setUTCHours(24, 0, 0, 0);

        // The Pacific offset at the next midnight can differ from the current offset.
        const estimate = midnight + date.getTime() - date.getUTCMilliseconds() - local,
            correction = midnight - GeminiQuotaUtil._getPacificWallTime(new Date(estimate));

        return estimate + correction - date.getTime();
    },

    getUnblockDelay: error => {
        const retryDelay = GeminiQuotaUtil.getRetryDelay(error);

        if (GeminiQuotaUtil.isDailyLimit(error)) {
            return Math.max(GeminiQuotaUtil.getTimeToDailyReset(), retryDelay ?? 0);
        }

        return retryDelay;
    }
});

export default GeminiQuotaUtil;
