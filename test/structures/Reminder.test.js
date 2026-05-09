import { describe, expect, test } from "vitest";

import Reminder from "../../src/structures/Reminder.js";

describe("Reminder", () => {
    test("formats timestamps, message text, and database payloads", () => {
        const reminder = new Reminder({
            user: "42",
            end: 1_000,
            msg: "hello *world*"
        });

        expect(reminder.hasMessage).toBe(true);
        expect(reminder.getData("rem_")).toEqual({
            rem_id: 0,
            rem_user: "42",
            rem_end: 1_000,
            rem_msg: "hello *world*"
        });
        expect(reminder.isPast(2_000)).toBe(true);
        expect(reminder.getTimestamp()).toMatch(/^<t:1:/);
        expect(reminder.getTimestamp(false)).toContain("1970");
        expect(reminder.format()).toContain("with the message:");
        expect(reminder.format()).toContain("hello");
    });
});
