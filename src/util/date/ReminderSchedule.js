import Util from "../Util.js";
import DateUtil from "./DateUtil.js";
import IntervalUtil from "./IntervalUtil.js";

const ReminderSchedule = Object.freeze({
    parse(value, interval = null) {
        if (!Util.nonemptyString(value)) {
            return null;
        }

        const cutoff = value.trim().match(ReminderSchedule._recurrenceEndRegex);

        if (cutoff === null) {
            return ReminderSchedule._parseSchedule(value, interval);
        }

        const [, start, kind, endText] = cutoff,
            parsed = ReminderSchedule._parseSchedule(start, interval);

        if (parsed?.interval == null) {
            return null;
        }

        let end;

        if (kind.toLowerCase() === "for") {
            const duration = IntervalUtil.parse(endText, true);

            if (duration === null) {
                return null;
            }

            end = IntervalUtil.getOccurrence(parsed.date, duration, 1);
        } else {
            end = ReminderSchedule._parseUntil(endText.trim());
        }

        if (!Number.isFinite(end) || end < parsed.date) {
            return null;
        }

        return { ...parsed, end };
    },

    _trailingEveryRegex: /^(.*?)\s+(?:repeat(?:ing)?\s+|recurr(?:ing)?\s+)?every\s+(.+)$/i,
    _recurrenceEndRegex: /^(.*?)\s+(for|until)\s+(.+)$/i,
    _everyPrefixRegex: /^every\s+/i,
    _startSeparatorRegex: /^(at|from|starting|start|begins?|on)\s+/i,

    _parseUntil(value) {
        if (/^\d{4}$/.test(value)) {
            return new Date(Number(value), 11, 31, 23, 59, 59, 999).getTime();
        }

        return DateUtil.parse(value);
    },

    _schedule(date, interval) {
        const now = Date.now();

        date ??= now;

        if (interval !== null && date < now) {
            const idx = IntervalUtil.getIndex(date, interval, now) + 1;
            date = IntervalUtil.getOccurrence(date, interval, idx);
        }

        return Number.isFinite(date) ? { date, interval } : null;
    },

    _scheduleFromDate(value, interval) {
        const date = DateUtil.parse(value);
        return date === null ? null : ReminderSchedule._schedule(date, interval);
    },

    _parseSchedule(value, interval) {
        value = value.trim();

        if (interval !== null) {
            return ReminderSchedule._scheduleFromDate(value, interval);
        }

        const trailing = value.match(ReminderSchedule._trailingEveryRegex);

        if (trailing !== null) {
            const [, start, duration] = trailing;
            interval = IntervalUtil.parse(duration, true);

            return interval === null ? null : ReminderSchedule._scheduleFromDate(start, interval);
        }

        const startsWithEvery = ReminderSchedule._everyPrefixRegex.test(value),
            prefix = IntervalUtil.readPrefix(value.replace(ReminderSchedule._everyPrefixRegex, ""));

        if (prefix === null || (!startsWithEvery && !prefix.named)) {
            return startsWithEvery ? null : ReminderSchedule._scheduleFromDate(value, null);
        }

        const start = prefix.rest.replace(ReminderSchedule._startSeparatorRegex, "");

        if (Util.empty(start)) {
            return ReminderSchedule._schedule(null, prefix.interval);
        }

        const date = DateUtil.parse(start) ?? DateUtil.parse(`at ${start}`);
        return date === null ? null : ReminderSchedule._schedule(date, prefix.interval);
    }
});

export default ReminderSchedule;
