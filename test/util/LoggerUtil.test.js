import { describe, expect, test } from "vitest";

import LoggerUtil from "../../src/util/LoggerUtil.js";

describe("LoggerUtil", () => {
    test("formats log values and handles circular JSON errors", () => {
        expect(LoggerUtil.formatLog(null)).toBe(" none");
        expect(LoggerUtil.formatLog(true)).toBe(' "true"');
        expect(LoggerUtil.formatLog("quoted")).toBe(' "quoted"');
        expect(LoggerUtil.formatLog('"wrapped"')).toBe(' "wrapped"');
        expect(LoggerUtil.formatLog("x".repeat(90), 10)).toContain("---");

        const circular = {};
        circular.self = circular;
        expect(LoggerUtil.formatLog(circular)).toContain("error:");
    });
});
