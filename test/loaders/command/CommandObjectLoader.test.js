import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "../../../setupGlobals.js";
import LoadStatus from "../../../src/loaders/LoadStatus.js";
import CommandObjectLoader from "../../../src/loaders/command/CommandObjectLoader.js";
import TextCommand from "../../../src/structures/command/TextCommand.js";

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

class TestCommand extends TextCommand {}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-command-object-loader-"));
});

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("CommandObjectLoader branches", () => {
    test("ignores commands that opt out during load and reports load failures", async () => {
        const ignorePath = path.join(tempDir, "ignore.js");
        await fs.writeFile(
            ignorePath,
            'class IgnoreCommand { static info = { name: "ignore-me" }; load() { return false; } async handler() { return "ignore"; } }\n\nexport default IgnoreCommand;\n'
        );

        const ignoreLoader = new CommandObjectLoader(ignorePath, createLogger(), {
            parent: {
                commandClass: TestCommand,
                extraOptions: {
                    description: "from-parent"
                }
            }
        });

        await expect(ignoreLoader.load()).resolves.toEqual([expect.any(TestCommand), LoadStatus.ignore]);
        expect(ignoreLoader.data.description).toBe("from-parent");
        expect(ignoreLoader.getIgnoredMessage()).toBe("Didn't load command: ignore-me");

        const errorPath = path.join(tempDir, "error.js");
        await fs.writeFile(
            errorPath,
            'class ExplodeCommand { static info = { name: "explode" }; load() { throw new Error("boom"); } async handler() { return "explode"; } }\n\nexport default ExplodeCommand;\n'
        );

        const errorLoader = new CommandObjectLoader(errorPath, createLogger(), {
            throwOnFailure: false,
            parent: {
                commandClass: TestCommand,
                extraOptions: {}
            }
        });

        await expect(errorLoader.load()).resolves.toEqual([null, LoadStatus.failed]);
    });
});
