import { describe, expect, test, vi } from "vitest";

import Util from "../../../src/util/Util.js";
import DateUtil from "../../../src/util/date/DateUtil.js";

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

    test("parses date ranges and validates ordering", () => {
        const range = DateUtil.parseRange("yesterday", "tomorrow");
        expect(range.from).toBeLessThan(range.to);

        expect(() => DateUtil.parseRange("invalid", "tomorrow")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("yesterday", "invalid")).toThrow("Invalid date");
        expect(() => DateUtil.parseRange("tomorrow", "yesterday")).toThrow("start date must be before");
    });
});
