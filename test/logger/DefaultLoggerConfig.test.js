import { describe, expect, test } from "vitest";
import getDefaultLoggerConfig from "../../src/logger/DefaultLoggerConfig.js";

describe("DefaultLoggerConfig", () => {
    test("returns the expected baseline logger options", () => {
        const config = getDefaultLoggerConfig("bot", "logs/app.log", true, "info");

        expect(config).toEqual(
            expect.objectContaining({
                name: "bot",
                filename: "logs/app.log",
                consoleOutput: true,
                level: "info",
                fileFormat: expect.any(Array),
                consoleFormat: expect.any(Array)
            })
        );
    });
});

describe("Merged Branch Coverage", () => {
    describe("DefaultLoggerConfig branch coverage", () => {
        test("formats console output with and without error stacks", () => {
            const config = getDefaultLoggerConfig("bot", "logs/app.log", true, "info");
            const printf = config.consoleFormat.find(entry => entry.name === "printf").opts;

            expect(
                printf({
                    timestamp: "2025-01-01 00:00:00",
                    service: "bot",
                    level: "info",
                    message: "ready"
                })
            ).toBe("[2025-01-01 00:00:00] - bot - info: ready");

            expect(
                printf({
                    timestamp: "2025-01-01 00:00:00",
                    service: "bot",
                    level: "error",
                    message: "boom",
                    stack: "stack trace"
                })
            ).toContain("\nstack trace");
        });
    });
});
