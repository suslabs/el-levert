import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    cleanupRuntime,
    createCommandRuntime,
    getCliCommand,
    executeCliCommand
} from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false,
        config: {
            enableCliCommands: true
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("cli eval command", () => {
    test("evaluates expressions through the real repl helper", async () => {
        const command = getCliCommand(runtime, "eval");

        await expect(executeCliCommand(command, "")).resolves.toBe("Can't eval an empty expression.");
        await expect(executeCliCommand(command, "1 + 1")).resolves.toBe(2);
    });

    test("loads scripts from absolute paths and errors on missing ones", async () => {
        const command = getCliCommand(runtime, "eval"),
            filePath = path.join(runtime.tempDir, "eval.js"),
            missingPath = path.join(runtime.tempDir, "missing.js");

        await fs.writeFile(filePath, "1 + 2");

        await expect(executeCliCommand(command, filePath)).resolves.toBe(3);
        await expect(executeCliCommand(command, missingPath)).resolves.toContain(
            "Error: The provided script path doesn't point to an existing file"
        );
    });
});
