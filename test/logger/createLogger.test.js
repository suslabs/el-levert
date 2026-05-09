import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import createLogger from "../../src/logger/createLogger.js";

let tempDir;
let loggers;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-logger-"));
    loggers = [];
});

afterEach(async () => {
    for (const logger of loggers) {
        for (const transport of logger.transports) {
            transport.close?.();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("createLogger", () => {
    test("requires an output method and creates console/file transports", () => {
        expect(() => createLogger({ consoleOutput: false })).toThrow("Must provide an output method");

        const consoleLogger = createLogger({
            name: "console",
            consoleOutput: true,
            consoleFormat: "simple"
        });
        loggers.push(consoleLogger);
        expect(consoleLogger.transports).toHaveLength(1);

        const fileLogger = createLogger({
            name: "file",
            filename: path.join(tempDir, "app.log"),
            consoleOutput: false,
            fileFormat: "json"
        });
        loggers.push(fileLogger);
        expect(path.basename(fileLogger.transports[0].filename)).toContain("app");
        expect(path.basename(fileLogger.transports[0].filename)).toContain("debug");
    });
});

describe("Merged Branch Coverage", () => {
    let tempDir;
    let loggers;
    let oldLevel;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-logger-branches-"));
        loggers = [];
        oldLevel = process.env.LOG_LEVEL;
    });

    afterEach(async () => {
        if (typeof oldLevel === "undefined") {
            delete process.env.LOG_LEVEL;
        } else {
            process.env.LOG_LEVEL = oldLevel;
        }

        for (const logger of loggers) {
            for (const transport of logger.transports) {
                transport.close?.();
            }
        }

        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe("createLogger branch coverage", () => {
        test("validates format requirements and uses env-based defaults", () => {
            expect(() =>
                createLogger({
                    filename: path.join(tempDir, "app.log"),
                    consoleOutput: false
                })
            ).toThrow("A file format must be provided");

            expect(() =>
                createLogger({
                    consoleOutput: true
                })
            ).toThrow("A console format must be provided");

            process.env.LOG_LEVEL = "warn";

            const logger = createLogger({
                consoleOutput: true,
                consoleFormat: "simple"
            });

            loggers.push(logger);

            expect(logger.level).toBe("warn");
            expect(logger.defaultMeta).toBeNull();

            const combined = createLogger({
                name: "service",
                meta: {
                    scope: "tests"
                },
                filename: path.join(tempDir, "combined.log"),
                consoleOutput: true,
                fileFormat: "json",
                consoleFormat: "simple"
            });

            loggers.push(combined);

            expect(combined.transports).toHaveLength(2);
            expect(combined.defaultMeta).toEqual({
                scope: "tests",
                service: "service"
            });
        });
    });
});
