import Reminder from "../../src/structures/Reminder.js";

import Util from "../../src/util/Util.js";
import IntervalUtil from "../../src/util/date/IntervalUtil.js";

describe("Reminder", () => {
    test("finds due and next occurrences without changing the schedule", () => {
        const once = new Reminder({ start: 1_000 });

        expect(once.getOccurrenceIndex(999)).toBeNull();
        expect(once.getOccurrenceIndex(999, true)).toBe(0);
        expect(once.getOccurrenceIndex(1_000)).toBe(0);
        expect(once.getOccurrenceIndex(2_000, true)).toBe(0);
        expect(once.getOccurrence(once.getOccurrenceIndex(999, true))).toBe(1_000);
        expect(once.getOccurrence(once.getOccurrenceIndex(2_000, true))).toBe(1_000);
        expect(once.getOccurrence(1)).toBeNull();
        expect(once.getOccurrence(0, true)).toBeNull();

        const recurring = new Reminder({ start: 1_000, end: 3_500, interval: 1_000 });

        expect(recurring.getOccurrenceIndex(999)).toBeNull();
        expect(recurring.getOccurrenceIndex(999, true)).toBe(0);
        expect(recurring.getOccurrence(recurring.getOccurrenceIndex(999, true))).toBe(1_000);
        expect(recurring.getOccurrenceIndex(2_000)).toBe(1);
        expect(recurring.getOccurrenceIndex(2_000, true)).toBe(2);
        expect(recurring.getOccurrence(1, true)).toBe(3_000);
        expect(recurring.getOccurrenceIndex(4_000)).toBe(2);
        expect(recurring.getOccurrenceIndex(4_000, true)).toBe(2);
        expect(recurring.getOccurrence(recurring.getOccurrenceIndex(4_000, true))).toBe(3_000);
        expect(recurring.getOccurrence(2, true)).toBeNull();
        expect(recurring.getOccurrence(3)).toBeNull();
        expect(recurring.start).toBe(1_000);
    });

    test("formats timestamps, message text, and database payloads", () => {
        const reminder = new Reminder({
            user: "42",
            start: 1_000,
            msg: "hello *world*"
        });

        expect(Reminder.from(reminder)).toBe(reminder);
        expect(Reminder.from(null, true)).toBe(null);
        expect(reminder.hasMessage).toBe(true);
        expect(reminder.getData("rem_")).toEqual({
            rem_id: 0,
            rem_user: "42",
            rem_start: 1_000,
            rem_end: null,
            rem_msg: "hello *world*",
            rem_interval: null
        });
        expect(reminder.getOccurrenceIndex(2_000)).toBe(0);
        expect(reminder.isRecurring).toBe(false);
        expect(reminder.getTimestamp()).toMatch(/^<t:1:/);
        expect(reminder.getTimestamp(false)).toContain("1970");
        expect(reminder.format()).toContain("with the message:");
        expect(reminder.format()).toContain("hello");
        expect(reminder.format(false)).not.toContain("with the message:");
        expect(reminder.format(false)).not.toContain("hello");

        const dayMs = Util.durationSeconds.day / Util.durationSeconds.milli,
            recurring = new Reminder({
                user: "42",
                start: 1_000,
                end: 1_000 + dayMs * 2,
                msg: "standup",
                interval: dayMs
            });

        expect(recurring.isRecurring).toBe(true);
        expect(recurring.getOccurrenceIndex(1_000 + dayMs * 1.5)).toBe(1);
        expect(recurring.getOccurrence(2)).toBe(1_000 + dayMs * 2);
        expect(recurring.getOccurrence(3)).toBeNull();
        expect(recurring.getOccurrence(1, true)).toBe(1_000 + dayMs * 2);
        expect(recurring.format()).toContain("(every day until ");
        expect(recurring.format()).toMatch(/until <t:\d+:f>/);
        expect(recurring.format()).toContain("standup");
    });

    test("calculates calendar occurrences from the original date and respects the cutoff", () => {
        const start = new Date(2024, 0, 31, 3).getTime(),
            feb = new Date(2024, 1, 29, 3).getTime(),
            march = new Date(2024, 2, 31, 3).getTime();

        const reminder = new Reminder({ start, end: march, interval: "1M" });

        expect(reminder.getOccurrence(1)).toBe(feb);
        expect(reminder.getOccurrence(2)).toBe(march);
        expect(reminder.getOccurrence(3)).toBeNull();
        expect(reminder.getOccurrenceIndex(feb - 1)).toBe(0);
        expect(reminder.getOccurrenceIndex(feb)).toBe(1);
        expect(reminder.getOccurrence(reminder.getOccurrenceIndex(feb, true))).toBe(march);
        expect(reminder.getOccurrence(reminder.getOccurrenceIndex(march, true))).toBe(march);
        expect(reminder.start).toBe(start);

        const day = Util.durationSeconds.day / Util.durationSeconds.milli;
        const mixed = new Reminder({ start, interval: "1M1D" });
        expect(mixed.getOccurrence(1)).toBe(feb + day);
        expect(mixed.getOccurrenceIndex(march + day * 2)).toBe(2);
        expect(IntervalUtil.format("30D")).toBe("4 weeks, 2 days");
    });

    test("keeps the local time across daylight saving changes", () => {
        const zone = process.env.TZ;
        process.env.TZ = "Europe/Bucharest";

        try {
            const start = new Date(2026, 2, 28, 8).getTime(),
                next = new Date(2026, 2, 29, 8).getTime();

            const reminder = new Reminder({ start, interval: "1D" });
            expect(reminder.getOccurrence(1)).toBe(next);
            expect(reminder.getOccurrenceIndex(next)).toBe(1);
            expect(next - start).toBe(
                (Util.durationSeconds.day - Util.durationSeconds.hour) / Util.durationSeconds.milli
            );
        } finally {
            if (typeof zone === "undefined") {
                delete process.env.TZ;
            } else {
                process.env.TZ = zone;
            }
        }
    });
});
