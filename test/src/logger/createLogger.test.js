import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import createLogger from "../../../src/logger/createLogger.js";

let tempDir;
let loggers;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-logger-"));
    loggers = [];
});

afterEach(async () => {
    vi.useRealTimers();

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

    test("automatically rotates log files each day and includes metadata in JSON log", async () => {
        vi.useFakeTimers();
        const date1 = new Date("2026-06-27T10:00:00.000Z");
        vi.setSystemTime(date1);

        const fileLogger = createLogger({
            name: "rotation-test",
            filename: path.join(tempDir, "rotation.log"),
            consoleOutput: false,
            fileFormat: [
                {
                    name: "timestamp",
                    opts: {
                        format: "YYYY-MM-DD HH:mm:ss"
                    }
                },
                "json"
            ]
        });
        loggers.push(fileLogger);

        const transport = fileLogger.transports[0];
        const open1 = new Promise(resolve => transport.once("open", resolve));
        await open1;

        expect(transport.filename).toContain("2026-06-27-rotation-debug.log");

        const logged1 = new Promise(resolve => transport.once("logged", resolve));
        fileLogger.info("first message");
        vi.runOnlyPendingTimers();
        await logged1;

        const date2 = new Date("2026-06-28T10:00:00.000Z");
        vi.setSystemTime(date2);

        const logged2 = new Promise(resolve => transport.once("logged", resolve)),
            open2 = new Promise(resolve => transport.once("open", resolve));

        fileLogger.info("second message");
        vi.runOnlyPendingTimers();

        await Promise.all([logged2, open2]);

        expect(transport.filename).toContain("2026-06-28-rotation-debug.log");

        const file1 = path.join(tempDir, "2026-06-27-rotation-debug.log"),
            file2 = path.join(tempDir, "2026-06-28-rotation-debug.log");

        for (const transport of fileLogger.transports) {
            transport.close?.();
        }

        const content1 = await fs.readFile(file1, "utf8"),
            content2 = await fs.readFile(file2, "utf8");

        const log1 = JSON.parse(content1.trim()),
            log2 = JSON.parse(content2.trim());

        expect(log1.message).toBe("first message");
        expect(log1.timestamp).toBeDefined();
        expect(log2.message).toBe("second message");
        expect(log2.timestamp).toBeDefined();

        vi.useRealTimers();
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
