import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, getCliCommand, executeCliCommand } from "../../helpers/commandHarness.js";

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
});
