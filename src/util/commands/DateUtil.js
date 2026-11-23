import { parseDate } from "chrono-node";

import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

let DateUtil = {
    parse: value => {
        value = value?.trim?.();

        if (Util.empty(value)) {
            return null;
        }

        let date = parseDate(value);

        if (!date) {
            date = parseDate(`in ${value}`);
        }

        return date?.getTime() ?? null;
    },

    _intervalTokenRegex: /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/g,
    _calendarRegex: /^(?:([1-9]\d*)M)?(?:([1-9]\d*)D)?(?:\+([1-9]\d*))?$/,

    parseInterval: (value, calendar = false) => {
        if (typeof value === "number") {
            return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
        }

        value = value?.trim?.();

        if (Util.empty(value)) {
            return null;
        }

        value = value.toLowerCase();

        const intervalUnit = DateUtil._units.get(value);

        if (typeof intervalUnit !== "undefined") {
            if (calendar && typeof intervalUnit.calendar !== "undefined") {
                return intervalUnit.calendar.months
                    ? `${intervalUnit.calendar.months}M`
                    : `${intervalUnit.calendar.days}D`;
            }

            return intervalUnit.multiplier;
        }

        const matches = Array.from(value.matchAll(DateUtil._intervalTokenRegex));

        if (Util.empty(matches)) {
            return null;
        }

        let months = 0,
            days = 0,
            totalMs = 0;

        for (const match of matches) {
            const num = parseFloat(match[1]),
                unit = DateUtil._units.get(match[2]);

            if (!Number.isFinite(num) || num <= 0 || typeof unit === "undefined" || unit.named) {
                return null;
            }

            if (calendar && typeof unit.calendar !== "undefined") {
                const calendarUnit = unit.calendar;

                if (calendarUnit.months > 0 && !Number.isInteger(num)) {
                    return null;
                }

                const dayCount = num * calendarUnit.days,
                    wholeDays = Math.floor(dayCount);

                months += num * calendarUnit.months;
                days += wholeDays;
                totalMs += Math.round(((dayCount - wholeDays) * Util.durationSeconds.day) / Util.durationSeconds.milli);
            } else {
                totalMs += Math.round(num * unit.multiplier);
            }
        }

        const nonDelim = value.replace(DateUtil._intervalTokenRegex, "").replace(/(?:\s|,|\band\b)+/g, "");

        if (!Util.empty(nonDelim) || !Number.isFinite(months) || !Number.isFinite(days) || !Number.isFinite(totalMs)) {
            return null;
        }

        if (months > 0 || days > 0) {
            const monthPart = months > 0 ? `${months}M` : "",
                dayPart = days > 0 ? `${days}D` : "",
                msPart = totalMs > 0 ? `+${totalMs}` : "";

            return `${monthPart}${dayPart}${msPart}`;
        }

        return totalMs > 0 ? totalMs : null;
    },

    isValidInterval: interval => {
        if (Number.isFinite(interval) && interval > 0) {
            return true;
        } else if (typeof interval !== "string") {
            return false;
        }

        const match = interval.match(DateUtil._calendarRegex);

        return (
            match !== null &&
            (typeof match[1] !== "undefined" || typeof match[2] !== "undefined") &&
            match.slice(1).every(value => Number.isFinite(Number(value ?? 0)))
        );
    },

    getIntervalOccurrence: (start, interval, idx) => {
        if (typeof interval === "number") {
            return start + interval * idx;
        }

        const [, monthText, dayText, msText] = interval.match(DateUtil._calendarRegex),
            months = Number(monthText ?? 0),
            days = Number(dayText ?? 0),
            ms = Number(msText ?? 0);

        const date = new Date(start),
            day = date.getDate();

        date.setDate(1);
        date.setMonth(date.getMonth() + months * idx);

        const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

        date.setDate(Math.min(day, lastDay));
        date.setDate(date.getDate() + days * idx);

        return date.getTime() + ms * idx;
    },

    getIntervalIndex: (start, interval, date) => {
        if (typeof interval === "number") {
            return Math.floor((date - start) / interval);
        } else if (date < start) {
            return -1;
        }

        let min = 0,
            max = 1;

        while (DateUtil.getIntervalOccurrence(start, interval, max) <= date) {
            min = max;
            max *= 2;
        }

        while (max - min > 1) {
            const mid = Math.floor((min + max) / 2);

            if (DateUtil.getIntervalOccurrence(start, interval, mid) <= date) {
                min = mid;
            } else {
                max = mid;
            }
        }

        return min;
    },

    formatInterval: interval => {
        let parts;

        if (typeof interval === "number") {
            parts = Util.duration(interval);
        } else {
            const [, monthText, dayText, msText] = interval.match(DateUtil._calendarRegex);

            parts = {};

            if (typeof monthText !== "undefined") {
                const months = Number(monthText),
                    years = Math.floor(months / 12),
                    remainingMonths = months % 12;

                if (years > 0) {
                    parts.year = years;
                }

                if (remainingMonths > 0) {
                    parts.month = remainingMonths;
                }
            }

            if (typeof dayText !== "undefined") {
                const duration = (Number(dayText) * Util.durationSeconds.day) / Util.durationSeconds.milli;
                Object.assign(parts, Util.duration(duration, { whitelist: ["week", "day"] }));
            }

            if (typeof msText !== "undefined") {
                Object.assign(parts, Util.duration(Number(msText), { whitelist: ["hour", "minute", "second"] }));
            }
        }

        return Util.formatUnitDurations(parts, Util.durationNames, { format: true }).replace(
            /^1 (millisecond|second|minute|hour|day|week|month|year)$/,
            "$1"
        );
    },

    _trailingEveryRegex: /^(.*?)\s+(?:repeat(?:ing)?\s+|recurr(?:ing)?\s+)?every\s+(.+)$/i,
    _recurrenceEndRegex: /^(.*?)\s+(for|until)\s+(.+)$/i,
    _everyPrefixRegex: /^every\s+/i,
    _everySepRegex: /^(.*?)\s+(?:at|from|starting|start|begins?|on)\s+(.+)$/i,
    _unitPrefixRegex: /^([a-zA-Z]+)\s+(.+)$/,

    parseDateRecurring: (value, intervalOverride) => {
        value = value?.trim?.();

        if (Util.empty(value)) {
            return null;
        }

        const endMatch = value.match(DateUtil._recurrenceEndRegex);

        if (endMatch === null) {
            return DateUtil._parseDateRecurring(value, intervalOverride);
        }

        const [, dateText, endType, endText] = endMatch,
            parsed = DateUtil._parseDateRecurring(dateText.trim(), intervalOverride);

        if (parsed === null || !parsed.isRecurring) {
            return null;
        }

        let end;

        if (endType.toLowerCase() === "for") {
            const duration = DateUtil.parseInterval(endText, true);

            if (duration === null) {
                return null;
            }

            end = DateUtil.getIntervalOccurrence(parsed.date, duration, 1);
        } else {
            end = DateUtil._parseUntil(endText);
        }

        if (!Number.isFinite(end) || end < parsed.date) {
            return null;
        }

        return { ...parsed, end };
    },

    _parseUntil: value => {
        const yearMatch = value.trim().match(/^\d{4}$/);

        if (yearMatch !== null) {
            const year = Number(yearMatch[0]);
            return new Date(year, 11, 31, 23, 59, 59, 999).getTime();
        }

        return DateUtil.parse(value);
    },

    _scheduleRecurring: (date, interval) => {
        const now = Date.now();

        date ??= now;

        if (date < now) {
            const idx = DateUtil.getIntervalIndex(date, interval, now) + 1;
            date = DateUtil.getIntervalOccurrence(date, interval, idx);
        }

        return {
            date,
            interval,
            isRecurring: true
        };
    },

    _parseDateRecurring: (value, intervalOverride) => {
        value = value?.trim?.();

        if (Util.empty(value)) {
            return null;
        }

        if (Util.nonemptyString(intervalOverride)) {
            const interval = DateUtil.parseInterval(intervalOverride, true);

            if (interval === null) {
                return null;
            }

            const date = DateUtil.parse(value);

            if (date === null) {
                return null;
            }

            return DateUtil._scheduleRecurring(date, interval);
        }

        const trailingEvery = value.match(DateUtil._trailingEveryRegex);

        if (trailingEvery !== null) {
            const interval = DateUtil.parseInterval(trailingEvery[2].trim(), true);

            if (interval !== null) {
                const date = DateUtil.parse(trailingEvery[1].trim());

                if (date !== null) {
                    return DateUtil._scheduleRecurring(date, interval);
                }
            }
        }

        const namedPrefix = value.match(DateUtil._namedPrefixRegex);

        if (namedPrefix !== null) {
            const interval = DateUtil.parseInterval(namedPrefix[1], true);

            if (Util.nonemptyString(namedPrefix[2])) {
                const date = DateUtil.parse(namedPrefix[2].trim());

                if (date !== null) {
                    return DateUtil._scheduleRecurring(date, interval);
                }
            } else {
                return DateUtil._scheduleRecurring(null, interval);
            }
        }

        if (DateUtil._everyPrefixRegex.test(value)) {
            const rest = value.replace(DateUtil._everyPrefixRegex, "").trim();

            const sepMatch = rest.match(DateUtil._everySepRegex);

            if (sepMatch !== null) {
                const interval = DateUtil.parseInterval(sepMatch[1].trim(), true);

                if (interval !== null) {
                    const date = DateUtil.parse(sepMatch[2].trim()) ?? DateUtil.parse(`at ${sepMatch[2].trim()}`);

                    if (date !== null) {
                        return DateUtil._scheduleRecurring(date, interval);
                    }
                }
            }

            const intervalMatches = Array.from(rest.matchAll(DateUtil._intervalTokenRegex));

            let lastEnd = 0;

            for (const match of intervalMatches) {
                const between = rest.slice(lastEnd, match.index).trim();

                if (match.index === lastEnd || Util.empty(between) || between === "and") {
                    lastEnd = match.index + match[0].length;

                    const candidateInterval = DateUtil.parseInterval(rest.slice(0, lastEnd), true),
                        candidateRest = rest.slice(lastEnd).trim();

                    if (candidateInterval !== null && Util.nonemptyString(candidateRest)) {
                        const date = DateUtil.parse(candidateRest);

                        if (date !== null) {
                            return DateUtil._scheduleRecurring(date, candidateInterval);
                        }
                    }
                } else {
                    break;
                }
            }

            const unitMatch = rest.match(DateUtil._unitPrefixRegex),
                unit = unitMatch === null ? null : DateUtil._units.get(unitMatch[1].toLowerCase());

            if (unit != null && !unit.named) {
                const interval = DateUtil.parseInterval(unitMatch[1], true);

                const date = DateUtil.parse(unitMatch[2].trim());

                if (date !== null) {
                    return DateUtil._scheduleRecurring(date, interval);
                }
            }

            const fullInterval = DateUtil.parseInterval(rest, true);

            if (fullInterval !== null) {
                return DateUtil._scheduleRecurring(null, fullInterval);
            }

            return null;
        }

        const date = DateUtil.parse(value);

        if (date === null) {
            return null;
        }

        return {
            date,
            interval: null,
            isRecurring: false
        };
    },

    parseRange: (fromText, toText) => {
        const from = DateUtil.parse(fromText),
            to = DateUtil.parse(toText);

        if (Util.nonemptyString(fromText) && from === null) {
            throw new UtilError(`Invalid date: \`${fromText}\`.`);
        } else if (Util.nonemptyString(toText) && to === null) {
            throw new UtilError(`Invalid date: \`${toText}\`.`);
        } else if (from !== null && to !== null && from > to) {
            throw new UtilError("The start date must be before the end date.");
        }

        return { from, to };
    }
};

{
    const unitDefinitions = {
        milli: { aliases: ["ms", "milli", "millis", "millisecond", "milliseconds"] },
        second: { aliases: ["s", "sec", "secs", "second", "seconds"] },
        minute: { aliases: ["m", "min", "mins", "minute", "minutes"] },
        hour: { aliases: ["h", "hr", "hrs", "hour", "hours"], named: "hourly" },
        day: { aliases: ["d", "day", "days"], named: "daily", calendar: { months: 0, days: 1 } },
        week: {
            aliases: ["w", "wk", "wks", "week", "weeks"],
            named: "weekly",
            calendar: { months: 0, days: Util.durationSeconds.week / Util.durationSeconds.day }
        },
        month: { aliases: ["mo", "month", "months"], named: "monthly", calendar: { months: 1, days: 0 } },
        year: { aliases: ["y", "yr", "yrs", "year", "years"], named: "yearly", calendar: { months: 12, days: 0 } }
    };

    DateUtil._units = new Map();

    const namedIntervals = [];

    for (const [name, definition] of Object.entries(unitDefinitions)) {
        const { aliases, named, calendar } = definition,
            unit = { multiplier: Util.durationSeconds[name] / Util.durationSeconds.milli, calendar };

        for (const alias of aliases) {
            DateUtil._units.set(alias, unit);
        }

        if (typeof named !== "undefined") {
            DateUtil._units.set(named, { ...unit, named: true });
            namedIntervals.push(named);
        }
    }

    DateUtil._namedPrefixRegex = new RegExp(
        String.raw`^(${namedIntervals.join("|")})(?:\s+(?:at|from|starting|start|on))?(?:\s+(.+))?$`,
        "i"
    );
}

DateUtil = Object.freeze(DateUtil);
export default DateUtil;
