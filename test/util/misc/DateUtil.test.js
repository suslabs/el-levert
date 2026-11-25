import { describe, expect, test, vi } from "vitest";

import Util from "../../../src/util/Util.js";
import DateUtil from "../../../src/util/misc/DateUtil.js";

describe("DateUtil", () => {
    test("returns today's UTC date string", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-27T23:30:00.000Z"));

        expect(DateUtil.today()).toBe("2026-06-27");

        vi.useRealTimers();
    });

    test("formats dates in UTC en-GB format", () => {
        expect(DateUtil.formatDate("2026-06-27T10:05:09.000Z")).toBe("Sat, 27/06/2026, 10:05:09 UTC");
    });

    test("parses standard and relative date strings", () => {
        expect(DateUtil.parse("")).toBeNull();
        expect(DateUtil.parse(null)).toBeNull();
        expect(DateUtil.parse("not a date")).toBeNull();

        const parsed = DateUtil.parse("in 2 hours");
        expect(parsed).toBeTypeOf("number");
        expect(parsed).toBeGreaterThan(Date.now());
    });

    test("parses interval tokens, named intervals, and compound durations", () => {
        expect(DateUtil.parseInterval("")).toBeNull();
        expect(DateUtil.parseInterval("nonsense")).toBeNull();
        expect(DateUtil.parseInterval(0)).toBeNull();
        expect(DateUtil.parseInterval(-50)).toBeNull();

        const oneHour = Util.durationSeconds.hour / Util.durationSeconds.milli;
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;

        expect(DateUtil.parseInterval("1h")).toBe(oneHour);
        expect(DateUtil.parseInterval("hour")).toBe(oneHour);
        expect(DateUtil.parseInterval("hourly")).toBe(oneHour);

        expect(DateUtil.parseInterval("10d")).toBe(10 * oneDay);
        expect(DateUtil.parseInterval("daily")).toBe(oneDay);
        expect(DateUtil.parseInterval("weekly")).toBe(7 * oneDay);

        expect(DateUtil.parseInterval("1d 12h")).toBe(oneDay + 12 * oneHour);
        expect(DateUtil.parseInterval("2 days and 3 hours")).toBe(2 * oneDay + 3 * oneHour);
        expect(DateUtil.parseInterval("1 month and 2 days", true)).toBe("1M2D");
        expect(DateUtil.isValidInterval("1M2D")).toBe(true);
        expect(DateUtil.isValidInterval("P1M2D")).toBe(false);
        expect(DateUtil.parseInterval("1.5 days", true)).toBe(`1D+${12 * oneHour}`);
        expect(DateUtil.parseInterval("0.5 days", true)).toBe(12 * oneHour);
        expect(DateUtil.parseInterval("1.5 months", true)).toBeNull();
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
                expect(DateUtil.parseInterval(alias)).toBe(ms);
                expect(DateUtil.parseInterval(alias, true)).toBe(calendar ?? ms);
            }
        }

        expect(DateUtil.parseInterval("2 daily")).toBeNull();
        expect(DateUtil.parseInterval("2 monthly", true)).toBeNull();
        expect(DateUtil.parseInterval("constructor")).toBeNull();
    });

    test("accepts finite intervals without imposing safe-integer limits", () => {
        const large = Number.MAX_SAFE_INTEGER + 1;
        const overflow = "9".repeat(310);

        expect(DateUtil.parseInterval(`${large} days`, true)).toBe(`${large}D`);
        expect(DateUtil.parseInterval(`${large} ms`)).toBe(large);
        expect(DateUtil.isValidInterval(`${large}D`)).toBe(true);
        expect(DateUtil.isValidInterval(large)).toBe(true);
        expect(DateUtil.parseInterval(`${overflow} days`, true)).toBeNull();
        expect(DateUtil.isValidInterval(`${overflow}D`)).toBe(false);
        expect(DateUtil.isValidInterval(Infinity)).toBe(false);
        expect(DateUtil.isValidInterval(NaN)).toBe(false);
    });

    test("formats interval durations using Util.duration", () => {
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;
        expect(DateUtil.formatInterval(oneDay)).toBe("day");
    });

    test("parses one-time dates with parseDateRecurring", () => {
        expect(DateUtil.parseDateRecurring("")).toBeNull();
        expect(DateUtil.parseDateRecurring("not a date")).toBeNull();

        const res = DateUtil.parseDateRecurring("in 3 hours");
        expect(res).not.toBeNull();
        expect(res.isRecurring).toBe(false);
        expect(res.interval).toBeNull();
        expect(res.date).toBeGreaterThan(Date.now());
    });

    test("parses recurring intervals with initial times using natural language", () => {
        // every <interval> <time>
        const res1 = DateUtil.parseDateRecurring("every 10d 12:46");
        expect(res1).not.toBeNull();
        expect(res1.isRecurring).toBe(true);
        expect(res1.interval).toBe("10D");
        expect(res1.date).toBeGreaterThan(Date.now());

        // every <interval> at <time>
        const res2 = DateUtil.parseDateRecurring("every 10d at 12:46");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe("10D");
        expect(res2.date).toBeGreaterThan(Date.now());

        // <time> every <interval>
        const res3 = DateUtil.parseDateRecurring("12:46 every 10d");
        expect(res3).not.toBeNull();
        expect(res3.isRecurring).toBe(true);
        expect(res3.interval).toBe("10D");
        expect(res3.date).toBeGreaterThan(Date.now());

        // at <time> every <interval>
        const res4 = DateUtil.parseDateRecurring("at 12:46 every 1d");
        expect(res4).not.toBeNull();
        expect(res4.isRecurring).toBe(true);
        expect(res4.interval).toBe("1D");
        expect(res4.date).toBeGreaterThan(Date.now());

        // daily at <time>
        const res5 = DateUtil.parseDateRecurring("daily at 12:46");
        expect(res5).not.toBeNull();
        expect(res5.isRecurring).toBe(true);
        expect(res5.interval).toBe("1D");
        expect(res5.date).toBeGreaterThan(Date.now());

        // every day 12:46
        const res6 = DateUtil.parseDateRecurring("every day 12:46");
        expect(res6).not.toBeNull();
        expect(res6.isRecurring).toBe(true);
        expect(res6.interval).toBe("1D");
        expect(res6.date).toBeGreaterThan(Date.now());
    });

    test("supports explicit recurrence interval override argument", () => {
        const res = DateUtil.parseDateRecurring("12:46", "10d");
        expect(res).not.toBeNull();
        expect(res.isRecurring).toBe(true);
        expect(res.interval).toBe("10D");
        expect(res.date).toBeGreaterThan(Date.now());

        const res2 = DateUtil.parseDateRecurring("tomorrow at 14:00", "1d");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe("1D");
        expect(res2.date).toBeGreaterThan(Date.now());

        expect(DateUtil.parseDateRecurring("12:46", "invalid_interval")).toBeNull();
        expect(DateUtil.parseDateRecurring("invalid_date", "1d")).toBeNull();
    });

    test("starts pure intervals immediately when no time anchor is supplied", () => {
        const before = Date.now();

        const res1 = DateUtil.parseDateRecurring("every 1d");
        expect(res1).not.toBeNull();
        expect(res1.isRecurring).toBe(true);
        expect(res1.interval).toBe("1D");
        expect(res1.date).toBeGreaterThanOrEqual(before);
        expect(res1.date).toBeLessThanOrEqual(Date.now());

        const res2 = DateUtil.parseDateRecurring("daily");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe("1D");
        expect(res2.date).toBeGreaterThanOrEqual(before);
        expect(res2.date).toBeLessThanOrEqual(Date.now());

        const res3 = DateUtil.parseDateRecurring("monthly");
        expect(res3.interval).toBe("1M");
    });

    test("keeps an anchored monthly recurrence in the current month when its time is still ahead", () => {
        const now = Date.now(),
            candidate = DateUtil.parse("3 am"),
            expected = candidate > now ? candidate : DateUtil.getIntervalOccurrence(candidate, "1M", 1),
            parsed = DateUtil.parseDateRecurring("every 1 month at 3 am");

        expect(parsed).not.toBeNull();
        expect(parsed.date).toBe(expected);
        expect(parsed.interval).toBe("1M");
    });

    test("uses today's time for daily and monthly recurrences when it has not passed", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 10, 23, 1));

        try {
            const expected = new Date(2026, 10, 23, 3).getTime();
            const monthly = DateUtil.parseDateRecurring("at 3 am every 1 month"),
                daily = DateUtil.parseDateRecurring("every day at 3 am");

            expect(monthly.date).toBe(expected);
            expect(monthly.interval).toBe("1M");
            expect(daily.date).toBe(expected);
            expect(daily.interval).toBe("1D");
        } finally {
            vi.useRealTimers();
        }
    });

    test("parses recurrence duration and calendar cutoff", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 10, 23, 1));

        try {
            const duration = DateUtil.parseDateRecurring("every day for 1 month"),
                cutoff = DateUtil.parseDateRecurring("every day until 2027");

            expect(duration).not.toBeNull();
            expect(duration.end).toBe(DateUtil.getIntervalOccurrence(duration.date, "1M", 1));
            expect(cutoff).not.toBeNull();
            expect(cutoff.end).toBe(new Date(2027, 11, 31, 23, 59, 59, 999).getTime());
        } finally {
            vi.useRealTimers();
        }
    });

    test("parses date ranges and validates ordering", () => {
        const range = DateUtil.parseRange("yesterday", "tomorrow");
        expect(range.from).toBeLessThan(range.to);

        expect(() => DateUtil.parseRange("invalid", "tomorrow")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("yesterday", "invalid")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("tomorrow", "yesterday")).toThrow("start date must be before");
    });
});
