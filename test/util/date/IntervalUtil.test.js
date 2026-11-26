import { describe, expect, test } from "vitest";

import Util from "../../../src/util/Util.js";
import IntervalUtil from "../../../src/util/date/IntervalUtil.js";

describe("IntervalUtil", () => {
    test("parses interval tokens, named intervals, and compound durations", () => {
        expect(IntervalUtil.parse("")).toBeNull();
        expect(IntervalUtil.parse("nonsense")).toBeNull();
        expect(IntervalUtil.parse(0)).toBeNull();
        expect(IntervalUtil.parse(-50)).toBeNull();

        const oneHour = Util.durationSeconds.hour / Util.durationSeconds.milli;
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;

        expect(IntervalUtil.parse("1h")).toBe(oneHour);
        expect(IntervalUtil.parse("hour")).toBe(oneHour);
        expect(IntervalUtil.parse("hourly")).toBe(oneHour);

        expect(IntervalUtil.parse("10d")).toBe(10 * oneDay);
        expect(IntervalUtil.parse("daily")).toBe(oneDay);
        expect(IntervalUtil.parse("weekly")).toBe(7 * oneDay);

        expect(IntervalUtil.parse("1d 12h")).toBe(oneDay + 12 * oneHour);
        expect(IntervalUtil.parse("2 days and 3 hours")).toBe(2 * oneDay + 3 * oneHour);
        expect(IntervalUtil.parse("1 month and 2 days", true)).toBe("1M2D");
        expect(IntervalUtil.isValid("1M2D")).toBe(true);
        expect(IntervalUtil.isValid("P1M2D")).toBe(false);
        expect(IntervalUtil.parse("1.5 days", true)).toBe(`1D+${12 * oneHour}`);
        expect(IntervalUtil.parse("0.5 days", true)).toBe(12 * oneHour);
        expect(IntervalUtil.parse("1.5 months", true)).toBeNull();
    });

    test("parses unit aliases and named intervals with their calendar equivalents", () => {
        const definitions = [
            [["ms", "milli", "millis", "millisecond", "milliseconds"], "milli", null],
            [["s", "sec", "secs", "second", "seconds"], "second", null],
            [["m", "min", "mins", "minute", "minutes"], "minute", null],
            [["h", "hr", "hrs", "hour", "hours", "hourly"], "hour", null],
            [["d", "day", "days", "daily"], "day", "1D"],
            [["w", "wk", "wks", "week", "weeks", "weekly"], "week", "7D"],
            [["mo", "month", "months", "monthly"], "month", "1M"],
            [["y", "yr", "yrs", "year", "years", "yearly"], "year", "12M"]
        ];

        for (const [aliases, name, calendar] of definitions) {
            const ms = Util.durationSeconds[name] / Util.durationSeconds.milli;

            for (const alias of aliases) {
                expect(IntervalUtil.parse(alias)).toBe(ms);
                expect(IntervalUtil.parse(alias, true)).toBe(calendar ?? ms);
            }
        }

        expect(IntervalUtil.parse("2 daily")).toBeNull();
        expect(IntervalUtil.parse("2 monthly", true)).toBeNull();
        expect(IntervalUtil.parse("constructor")).toBeNull();
    });

    test("accepts finite intervals without imposing safe-integer limits", () => {
        const large = Number.MAX_SAFE_INTEGER + 1;
        const overflow = "9".repeat(310);

        expect(IntervalUtil.parse(`${large} days`, true)).toBe(`${large}D`);
        expect(IntervalUtil.parse(`${large} ms`)).toBe(large);
        expect(IntervalUtil.isValid(`${large}D`)).toBe(true);
        expect(IntervalUtil.isValid(large)).toBe(true);
        expect(IntervalUtil.parse(`${overflow} days`, true)).toBeNull();
        expect(IntervalUtil.isValid(`${overflow}D`)).toBe(false);
        expect(IntervalUtil.isValid(Infinity)).toBe(false);
        expect(IntervalUtil.isValid(NaN)).toBe(false);
    });

    test("formats interval durations using Util.duration", () => {
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;
        expect(IntervalUtil.format(oneDay)).toBe("day");
    });

    test("uses Chrono's word amounts and rejects text beyond the duration", () => {
        const minute = Util.durationSeconds.minute / Util.durationSeconds.milli;

        expect(IntervalUtil.parse("two hours and half an hour")).toBe(150 * minute);
        expect(IntervalUtil.parse("a week and two days", true)).toBe("9D");
        expect(IntervalUtil.parse("1h garbage")).toBeNull();
        expect(IntervalUtil.parse("in two hours")).toBeNull();
    });
});
