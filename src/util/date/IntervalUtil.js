import ChronoDuration from "./ChronoDuration.js";

import Util from "../Util.js";

const IntervalUtil = Object.freeze({
    _calendarRegex: /^(?=[1-9]\d*[MD])(?:([1-9]\d*)M)?(?:([1-9]\d*)D)?(?:\+([1-9]\d*))?$/,

    _monthsPerYear: 12,
    _quartersPerYear: 4,
    _daysPerWeek: Util.durationSeconds.week / Util.durationSeconds.day,

    _decodeCalendar: interval => {
        const match = interval.match(IntervalUtil._calendarRegex);

        if (match === null) {
            return null;
        }

        const [, monthText, dayText, msText] = match,
            months = Number(monthText ?? 0),
            days = Number(dayText ?? 0),
            ms = Number(msText ?? 0);

        return [months, days, ms].every(Number.isFinite) ? { months, days, ms } : null;
    },

    _toInterval: (parts, calendar) => {
        let months = 0,
            days = 0;

        let ms = 0;

        const monthsPerQuarter = IntervalUtil._monthsPerYear / IntervalUtil._quartersPerYear;

        for (const [unit, count] of parts) {
            if (calendar) {
                switch (unit) {
                    case "year":
                    case "quarter":
                    case "month":
                        if (!Number.isInteger(count)) {
                            return null;
                        }

                        months +=
                            count *
                            (unit === "year" ? IntervalUtil._monthsPerYear : unit === "quarter" ? monthsPerQuarter : 1);
                        continue;
                    case "week":
                    case "day":
                        days += count * (unit === "week" ? IntervalUtil._daysPerWeek : 1);
                        continue;
                }
            }

            const seconds =
                unit === "quarter" ? monthsPerQuarter * Util.durationSeconds.month : Util.durationSeconds[unit];

            ms += (count * seconds) / Util.durationSeconds.milli;
        }

        ms = Math.round(ms + ((days % 1) * Util.durationSeconds.day) / Util.durationSeconds.milli);
        days = Math.floor(days);

        if (![months, days, ms].every(Number.isFinite)) {
            return null;
        }

        if (months > 0 || days > 0) {
            const monthPart = months > 0 ? `${months}M` : "",
                dayPart = days > 0 ? `${days}D` : "",
                msPart = ms > 0 ? `+${ms}` : "";

            return monthPart + dayPart + msPart;
        }

        return ms > 0 ? ms : null;
    },

    parse: (value, calendar = false) => {
        if (typeof value === "number") {
            value = Math.round(value);
            return Number.isFinite(value) && value > 0 ? value : null;
        } else if (!Util.nonemptyString(value)) {
            return null;
        }

        const result = ChronoDuration.read(value);
        return result !== null && Util.empty(result.rest) ? IntervalUtil._toInterval(result.parts, calendar) : null;
    },

    readPrefix: text => {
        const result = ChronoDuration.read(text);

        if (result === null) {
            return null;
        }

        const { parts, rest, named } = result,
            interval = IntervalUtil._toInterval(parts, true);

        return interval === null ? null : { interval, rest, named };
    },

    isValid: interval => {
        if (typeof interval === "number") {
            return Number.isFinite(interval) && interval > 0;
        }

        return typeof interval === "string" && IntervalUtil._decodeCalendar(interval) !== null;
    },

    getOccurrence: (start, interval, idx) => {
        if (typeof interval === "number") {
            return start + interval * idx;
        }

        const { months, days, ms } = IntervalUtil._decodeCalendar(interval);

        const date = new Date(start),
            day = date.getDate();

        date.setDate(1);
        date.setMonth(date.getMonth() + months * idx);

        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        date.setDate(Math.min(day, lastDay));
        date.setDate(date.getDate() + days * idx);

        return date.getTime() + ms * idx;
    },

    getIndex: (start, interval, date) => {
        if (typeof interval === "number") {
            return Math.floor((date - start) / interval);
        } else if (date < start) {
            return -1;
        }

        let min = 0,
            max = 1;

        while (IntervalUtil.getOccurrence(start, interval, max) <= date) {
            min = max;
            max *= 2;
        }

        while (max - min > 1) {
            const mid = Math.floor((min + max) / 2);

            if (IntervalUtil.getOccurrence(start, interval, mid) <= date) {
                min = mid;
            } else {
                max = mid;
            }
        }

        return min;
    },

    format: interval => {
        let parts;

        if (typeof interval === "number") {
            parts = Util.duration(interval);
        } else {
            const { months, days, ms } = IntervalUtil._decodeCalendar(interval);

            const year = Math.floor(months / IntervalUtil._monthsPerYear),
                month = months % IntervalUtil._monthsPerYear;

            const dayMs = (days * Util.durationSeconds.day) / Util.durationSeconds.milli;

            parts = {
                ...(year > 0 ? { year } : {}),
                ...(month > 0 ? { month } : {}),
                ...(days > 0 ? Util.duration(dayMs, { whitelist: ["week", "day"] }) : {}),
                ...(ms > 0 ? Util.duration(ms, { whitelist: ["hour", "minute", "second"] }) : {})
            };
        }

        return Util.formatUnitDurations(parts, Util.durationNames, { format: true }).replace(
            /^1 (millisecond|second|minute|hour|day|week|month|year)$/,
            "$1"
        );
    }
});

export default IntervalUtil;
