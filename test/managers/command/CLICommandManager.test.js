import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let tempDir;
let CLICommandManager;
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
            wrapEvents: false,
            cliCmdPrefix: "."
        }
    });

    tempDir = path.join(runtime.tempDir, "cli");
    await fs.mkdir(tempDir, { recursive: true });
    runtime.client.config.cliCommandsPath = tempDir;

    ({ default: CLICommandManager } = await import("../../../src/managers/command/CLICommandManager.js"));
});

afterEach(async () => {
    manager?.unload?.();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("CLICommandManager", () => {
    test("loads real CLI command files and parses them with the CLI prefix", async () => {
        await writeCommand(
            "help.js",
            'class HelpCommand { static info = { name: "help", prefix: ".", description: "Help", category: "info" }; async handler() { return "help"; } }\n\nexport default HelpCommand;'
        );

        manager = new CLICommandManager(true);
        await manager.load();

        expect(manager.isCommand(".help")).toBe(true);
        expect(manager.getCommand(".help now")[0]?.name).toBe("help");
        expect(manager.getHelp()).toContain("help");
    });
});
