import { describe, expect, test } from "vitest";

import Util from "../../../src/util/Util.js";
import DateUtil from "../../../src/util/commands/DateUtil.js";

describe("DateUtil", () => {
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
    });

    test("formats interval durations using Util.duration", () => {
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;
        expect(DateUtil.formatInterval(oneDay)).toContain("1 day");
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
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;
        const tenDays = 10 * oneDay;

        // every <interval> <time>
        const res1 = DateUtil.parseDateRecurring("every 10d 12:46");
        expect(res1).not.toBeNull();
        expect(res1.isRecurring).toBe(true);
        expect(res1.interval).toBe(tenDays);
        expect(res1.date).toBeGreaterThan(Date.now());

        // every <interval> at <time>
        const res2 = DateUtil.parseDateRecurring("every 10d at 12:46");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe(tenDays);
        expect(res2.date).toBeGreaterThan(Date.now());

        // <time> every <interval>
        const res3 = DateUtil.parseDateRecurring("12:46 every 10d");
        expect(res3).not.toBeNull();
        expect(res3.isRecurring).toBe(true);
        expect(res3.interval).toBe(tenDays);
        expect(res3.date).toBeGreaterThan(Date.now());

        // at <time> every <interval>
        const res4 = DateUtil.parseDateRecurring("at 12:46 every 1d");
        expect(res4).not.toBeNull();
        expect(res4.isRecurring).toBe(true);
        expect(res4.interval).toBe(oneDay);
        expect(res4.date).toBeGreaterThan(Date.now());

        // daily at <time>
        const res5 = DateUtil.parseDateRecurring("daily at 12:46");
        expect(res5).not.toBeNull();
        expect(res5.isRecurring).toBe(true);
        expect(res5.interval).toBe(oneDay);
        expect(res5.date).toBeGreaterThan(Date.now());

        // every day 12:46
        const res6 = DateUtil.parseDateRecurring("every day 12:46");
        expect(res6).not.toBeNull();
        expect(res6.isRecurring).toBe(true);
        expect(res6.interval).toBe(oneDay);
        expect(res6.date).toBeGreaterThan(Date.now());
    });

    test("supports explicit recurrence interval override argument", () => {
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;
        const tenDays = 10 * oneDay;

        const res = DateUtil.parseDateRecurring("12:46", "10d");
        expect(res).not.toBeNull();
        expect(res.isRecurring).toBe(true);
        expect(res.interval).toBe(tenDays);
        expect(res.date).toBeGreaterThan(Date.now());

        const res2 = DateUtil.parseDateRecurring("tomorrow at 14:00", "1d");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe(oneDay);
        expect(res2.date).toBeGreaterThan(Date.now());

        expect(DateUtil.parseDateRecurring("12:46", "invalid_interval")).toBeNull();
        expect(DateUtil.parseDateRecurring("invalid_date", "1d")).toBeNull();
    });

    test("parses pure intervals without an initial time by scheduling from now", () => {
        const oneDay = Util.durationSeconds.day / Util.durationSeconds.milli;

        const res1 = DateUtil.parseDateRecurring("every 1d");
        expect(res1).not.toBeNull();
        expect(res1.isRecurring).toBe(true);
        expect(res1.interval).toBe(oneDay);
        expect(res1.date).toBeGreaterThan(Date.now());

        const res2 = DateUtil.parseDateRecurring("daily");
        expect(res2).not.toBeNull();
        expect(res2.isRecurring).toBe(true);
        expect(res2.interval).toBe(oneDay);
        expect(res2.date).toBeGreaterThan(Date.now());
    });

    test("parses date ranges and validates ordering", () => {
        const range = DateUtil.parseRange("yesterday", "tomorrow");
        expect(range.from).toBeLessThan(range.to);

        expect(() => DateUtil.parseRange("invalid", "tomorrow")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("yesterday", "invalid")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("tomorrow", "yesterday")).toThrow("start date must be before");
    });
});
