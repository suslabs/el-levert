import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "../../../setupGlobals.js";
import LoadStatus from "../../../src/loaders/LoadStatus.js";
import EventObjectLoader from "../../../src/loaders/event/EventObjectLoader.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-event-loader-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("EventObjectLoader", () => {
    test("loads event modules into BotEvent instances", async () => {
        const eventPath = path.join(tempDir, "ready.js");

        await fs.writeFile(eventPath, 'export default { name: "ready", once: true, listener: () => "ok" };\n');

        const loader = new EventObjectLoader(eventPath, {
            log: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {}
        });

        await expect(loader.load()).resolves.toEqual([expect.anything(), LoadStatus.successful]);
        expect(loader.data.name).toBe("ready");
        expect(loader.data.once).toBe(true);
        expect(loader.getLoadedMessage()).toContain("ready");
    });
});

describe("Merged Branch Coverage", () => {
    let tempDir;

    function createLogger() {
        return {
            debug: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
            log: vi.fn(),
            warn: vi.fn()
        };
    }

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-event-loader-branches-"));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    describe("EventObjectLoader branches", () => {
        test("propagates event construction failures when configured not to throw", async () => {
            const invalidPath = path.join(tempDir, "invalid.js");
            await fs.writeFile(invalidPath, 'export default { name: "", listener: null };\n');

            const loader = new EventObjectLoader(invalidPath, createLogger(), {
                throwOnFailure: false
            });

            await expect(loader.load()).resolves.toEqual([null, LoadStatus.failed]);
        });
    });
});
