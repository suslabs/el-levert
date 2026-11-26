import { describe, expect, test, vi } from "vitest";

import ReminderSchedule from "../../../src/util/date/ReminderSchedule.js";
import DateUtil from "../../../src/util/date/DateUtil.js";
import IntervalUtil from "../../../src/util/date/IntervalUtil.js";

describe("ReminderSchedule", () => {
    test("parses one-time dates with the reminder schedule parser", () => {
        expect(ReminderSchedule.parse("")).toBeNull();
        expect(ReminderSchedule.parse("not a date")).toBeNull();

        const res = ReminderSchedule.parse("in 3 hours");
        expect(res).not.toBeNull();
        expect(res.interval).toBeNull();
        expect(res.date).toBeGreaterThan(Date.now());
    });

    test("parses recurring intervals with initial times using natural language", () => {
        // every <interval> <time>
        const res1 = ReminderSchedule.parse("every 10d 12:46");
        expect(res1).not.toBeNull();
        expect(res1.interval).toBe("10D");
        expect(res1.date).toBeGreaterThan(Date.now());

        // every <interval> at <time>
        const res2 = ReminderSchedule.parse("every 10d at 12:46");
        expect(res2).not.toBeNull();
        expect(res2.interval).toBe("10D");
        expect(res2.date).toBeGreaterThan(Date.now());

        // <time> every <interval>
        const res3 = ReminderSchedule.parse("12:46 every 10d");
        expect(res3).not.toBeNull();
        expect(res3.interval).toBe("10D");
        expect(res3.date).toBeGreaterThan(Date.now());

        // at <time> every <interval>
        const res4 = ReminderSchedule.parse("at 12:46 every 1d");
        expect(res4).not.toBeNull();
        expect(res4.interval).toBe("1D");
        expect(res4.date).toBeGreaterThan(Date.now());

        // daily at <time>
        const res5 = ReminderSchedule.parse("daily at 12:46");
        expect(res5).not.toBeNull();
        expect(res5.interval).toBe("1D");
        expect(res5.date).toBeGreaterThan(Date.now());

        // every day 12:46
        const res6 = ReminderSchedule.parse("every day 12:46");
        expect(res6).not.toBeNull();
        expect(res6.interval).toBe("1D");
        expect(res6.date).toBeGreaterThan(Date.now());
    });

    test("supports explicit recurrence interval override argument", () => {
        const res = ReminderSchedule.parse("12:46", "10D");
        expect(res).not.toBeNull();
        expect(res.interval).toBe("10D");
        expect(res.date).toBeGreaterThan(Date.now());

        const res2 = ReminderSchedule.parse("tomorrow at 14:00", "1D");
        expect(res2).not.toBeNull();
        expect(res2.interval).toBe("1D");
        expect(res2.date).toBeGreaterThan(Date.now());

        expect(ReminderSchedule.parse("invalid_date", "1D")).toBeNull();
    });

    test("starts pure intervals immediately when no time anchor is supplied", () => {
        const before = Date.now();

        const res1 = ReminderSchedule.parse("every 1d");
        expect(res1).not.toBeNull();
        expect(res1.interval).toBe("1D");
        expect(res1.date).toBeGreaterThanOrEqual(before);
        expect(res1.date).toBeLessThanOrEqual(Date.now());

        const res2 = ReminderSchedule.parse("daily");
        expect(res2).not.toBeNull();
        expect(res2.interval).toBe("1D");
        expect(res2.date).toBeGreaterThanOrEqual(before);
        expect(res2.date).toBeLessThanOrEqual(Date.now());

        const res3 = ReminderSchedule.parse("monthly");
        expect(res3.interval).toBe("1M");
    });

    test("keeps an anchored monthly recurrence in the current month when its time is still ahead", () => {
        const now = Date.now(),
            candidate = DateUtil.parse("3 am"),
            expected = candidate > now ? candidate : IntervalUtil.getOccurrence(candidate, "1M", 1),
            parsed = ReminderSchedule.parse("every 1 month at 3 am");

        expect(parsed).not.toBeNull();
        expect(parsed.date).toBe(expected);
        expect(parsed.interval).toBe("1M");
    });

    test("uses today's time for daily and monthly recurrences when it has not passed", () => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(new Date(2026, 10, 23, 1));

        try {
            const expected = new Date(2026, 10, 23, 3).getTime();
            const monthly = ReminderSchedule.parse("at 3 am every 1 month"),
                daily = ReminderSchedule.parse("every day at 3 am");

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
            const duration = ReminderSchedule.parse("every day for 1 month"),
                cutoff = ReminderSchedule.parse("every day until 2027");

            expect(duration).not.toBeNull();
            expect(duration.end).toBe(IntervalUtil.getOccurrence(duration.date, "1M", 1));
            expect(cutoff).not.toBeNull();
            expect(cutoff.end).toBe(new Date(2027, 11, 31, 23, 59, 59, 999).getTime());
        } finally {
            vi.useRealTimers();
        }
    });
});
