import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let tempDir;
let TextCommandManager;
let TestTextCommandManager;
let manager;

async function writeCommand(relPath, source) {
    const filePath = path.join(tempDir, relPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            wrapEvents: false
        }
    });

    tempDir = path.join(runtime.tempDir, "commands");
    await fs.mkdir(tempDir, { recursive: true });

    ({ default: TextCommandManager } = await import("../../../src/managers/command/TextCommandManager.js"));

    TestTextCommandManager = class TestTextCommandManager extends TextCommandManager {
        static $name = "testTextCommandManager";
    };
});

afterEach(async () => {
    manager?.unload?.();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("TextCommandManager", () => {
    test("loads real command files, parses commands, and formats grouped help", async () => {
        await writeCommand(
            "alpha.js",
            'class AlphaCommand { static info = { name: "alpha", prefix: "!", description: "Alpha", category: "info" }; async handler() { return "ok"; } }\n\nexport default AlphaCommand;'
        );
        await writeCommand(
            "zeta.js",
            'class ZetaCommand { static info = { name: "zeta", prefix: "!", aliases: ["z"], description: "Zeta", category: "misc" }; async handler() { return "ok"; } }\n\nexport default ZetaCommand;'
        );

        manager = new TestTextCommandManager(true, tempDir, "!");
        await manager.load();

        expect(manager.isCommand("!alpha")).toBe(true);
        expect(manager.isCommand("alpha")).toBe(false);
        expect(manager.getCommand("!z arg1 arg2")[0]?.name).toBe("zeta");
        expect(manager.getCommand("!z arg1 arg2")).toEqual([
            manager.searchCommands("zeta"),
            "z",
            "arg1 arg2",
            expect.objectContaining({
                name: "z",
                argsText: "arg1 arg2"
            })
        ]);

        const help = manager.getHelp();
        expect(help).toContain("Information commands");
        expect(help).toContain("Misc commands");
        expect(help).toContain("alpha");
        expect(help).toContain("zeta/z");
    });
});
