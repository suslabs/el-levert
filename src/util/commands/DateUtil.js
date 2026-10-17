import { parseDate } from "chrono-node";

import Util from "../Util.js";

import UtilError from "../../errors/UtilError.js";

let DateUtil = {
    parse: value => {
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

    parseInterval: value => {
        if (typeof value === "number" && !isNaN(value) && value > 0) {
            return Math.round(value);
        } else if (Util.empty(value) || typeof value !== "string") {
            return null;
        }

        const trimmed = value.trim().toLowerCase();

        if (Object.hasOwn(DateUtil._namedIntervals, trimmed)) {
            return DateUtil._namedIntervals[trimmed];
        } else if (Object.hasOwn(DateUtil._units, trimmed)) {
            return DateUtil._units[trimmed];
        }

        const matches = Array.from(trimmed.matchAll(DateUtil._intervalTokenRegex));

        if (Util.empty(matches)) {
            return null;
        }

        let totalMs = 0;

        for (const match of matches) {
            const num = parseFloat(match[1]),
                unit = match[2]?.toLowerCase();

            if (isNaN(num) || num <= 0 || !Object.hasOwn(DateUtil._units, unit)) {
                return null;
            }

            totalMs += Math.round(num * DateUtil._units[unit]);
        }

        const nonDelim = trimmed.replace(DateUtil._intervalTokenRegex, "").replace(/[\s,and]+/g, "");

        if (!Util.empty(nonDelim)) {
            return null;
        }

        return totalMs > 0 ? totalMs : null;
    },

    formatInterval: ms => {
        return Util.duration(ms, { format: true });
    },

    _trailingEveryRegex: /^(.*?)\s+(?:repeat(?:ing)?\s+|recurr(?:ing)?\s+)?every\s+([^,]+)$/i,
    _namedPrefixRegex: /^(hourly|daily|weekly|monthly|yearly)(?:\s+(?:at|from|starting|start|on))?(?:\s+(.+))?$/i,
    _everyPrefixRegex: /^every\s+/i,
    _everySepRegex: /^(.*?)\s+(?:at|from|starting|start|begins?|on)\s+(.+)$/i,
    _unitPrefixRegex: /^([a-zA-Z]+)\s+(.+)$/,

    parseDateRecurring: (value, intervalOverride) => {
        if (Util.empty(value) || typeof value !== "string") {
            return null;
        }

        const trimmed = value.trim();

        if (Util.nonemptyString(intervalOverride)) {
            const interval = DateUtil.parseInterval(intervalOverride);

            if (interval === null || interval <= 0) {
                return null;
            }

            let date = DateUtil.parse(trimmed);

            if (date === null) {
                return null;
            }

            const now = Date.now();

            if (date <= now) {
                while (date <= now) {
                    date += interval;
                }
            }

            return {
                date,
                interval,
                isRecurring: true
            };
        }

        const trailingEvery = trimmed.match(DateUtil._trailingEveryRegex);

        if (trailingEvery !== null) {
            const interval = DateUtil.parseInterval(trailingEvery[2].trim());

            if (interval !== null && interval > 0) {
                let date = DateUtil.parse(trailingEvery[1].trim());

                if (date !== null) {
                    const now = Date.now();

                    if (date <= now) {
                        while (date <= now) {
                            date += interval;
                        }
                    }

                    return {
                        date,
                        interval,
                        isRecurring: true
                    };
                }
            }
        }

        const namedPrefix = trimmed.match(DateUtil._namedPrefixRegex);

        if (namedPrefix !== null) {
            const interval = DateUtil._namedIntervals[namedPrefix[1].toLowerCase()];

            if (Util.nonemptyString(namedPrefix[2])) {
                let date = DateUtil.parse(namedPrefix[2].trim());

                if (date !== null) {
                    const now = Date.now();

                    if (date <= now) {
                        while (date <= now) {
                            date += interval;
                        }
                    }

                    return {
                        date,
                        interval,
                        isRecurring: true
                    };
                }
            } else {
                return {
                    date: Date.now() + interval,
                    interval,
                    isRecurring: true
                };
            }
        }

        if (DateUtil._everyPrefixRegex.test(trimmed)) {
            const rest = trimmed.replace(DateUtil._everyPrefixRegex, "").trim();

            const sepMatch = rest.match(DateUtil._everySepRegex);

            if (sepMatch !== null) {
                const interval = DateUtil.parseInterval(sepMatch[1].trim());

                if (interval !== null && interval > 0) {
                    let date = DateUtil.parse(sepMatch[2].trim()) ?? DateUtil.parse(`at ${sepMatch[2].trim()}`);

                    if (date !== null) {
                        const now = Date.now();

                        if (date <= now) {
                            while (date <= now) {
                                date += interval;
                            }
                        }

                        return {
                            date,
                            interval,
                            isRecurring: true
                        };
                    }
                }
            }

            const intervalMatches = Array.from(rest.matchAll(DateUtil._intervalTokenRegex));
            let lastEnd = 0;

            for (const match of intervalMatches) {
                const between = rest.slice(lastEnd, match.index).trim();

                if (match.index === lastEnd || Util.empty(between) || between === "and") {
                    lastEnd = match.index + match[0].length;

                    const candidateInterval = DateUtil.parseInterval(rest.slice(0, lastEnd)),
                        candidateRest = rest.slice(lastEnd).trim();

                    if (candidateInterval !== null && Util.nonemptyString(candidateRest)) {
                        let date = DateUtil.parse(candidateRest);

                        if (date !== null) {
                            const now = Date.now();

                            if (date <= now) {
                                while (date <= now) {
                                    date += candidateInterval;
                                }
                            }

                            return {
                                date,
                                interval: candidateInterval,
                                isRecurring: true
                            };
                        }
                    }
                } else {
                    break;
                }
            }

            const unitMatch = rest.match(DateUtil._unitPrefixRegex);

            if (unitMatch !== null && Object.hasOwn(DateUtil._units, unitMatch[1].toLowerCase())) {
                const interval = DateUtil._units[unitMatch[1].toLowerCase()];

                let date = DateUtil.parse(unitMatch[2].trim());

                if (date !== null) {
                    const now = Date.now();

                    if (date <= now) {
                        while (date <= now) {
                            date += interval;
                        }
                    }

                    return {
                        date,
                        interval,
                        isRecurring: true
                    };
                }
            }

            const fullInterval = DateUtil.parseInterval(rest);

            if (fullInterval !== null && fullInterval > 0) {
                return {
                    date: Date.now() + fullInterval,
                    interval: fullInterval,
                    isRecurring: true
                };
            }

            return null;
        }

        const date = DateUtil.parse(trimmed);

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
    const unitAliases = [
        [["ms", "milli", "millis", "millisecond", "milliseconds"], 1],
        [["s", "sec", "secs", "second", "seconds"], Util.durationSeconds.second / Util.durationSeconds.milli],
        [["m", "min", "mins", "minute", "minutes"], Util.durationSeconds.minute / Util.durationSeconds.milli],
        [["h", "hr", "hrs", "hour", "hours"], Util.durationSeconds.hour / Util.durationSeconds.milli],
        [["d", "day", "days"], Util.durationSeconds.day / Util.durationSeconds.milli],
        [["w", "wk", "wks", "week", "weeks"], Util.durationSeconds.week / Util.durationSeconds.milli],
        [["mo", "month", "months"], Util.durationSeconds.month / Util.durationSeconds.milli],
        [["y", "yr", "yrs", "year", "years"], Util.durationSeconds.year / Util.durationSeconds.milli]
    ];

    DateUtil._units = {};

    for (const [aliases, multiplier] of unitAliases) {
        for (const alias of aliases) {
            DateUtil._units[alias] = multiplier;
        }
    }

    DateUtil._units = Object.freeze(DateUtil._units);

    DateUtil._namedIntervals = Object.freeze({
        hourly: Util.durationSeconds.hour / Util.durationSeconds.milli,
        daily: Util.durationSeconds.day / Util.durationSeconds.milli,
        weekly: Util.durationSeconds.week / Util.durationSeconds.milli,
        monthly: Util.durationSeconds.month / Util.durationSeconds.milli,
        yearly: Util.durationSeconds.year / Util.durationSeconds.milli
    });
}

DateUtil = Object.freeze(DateUtil);
export default DateUtil;
