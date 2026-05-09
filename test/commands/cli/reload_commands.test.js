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

describe("cli reload_commands command", () => {
    test("reloads the real text command set", async () => {
        const command = getCliCommand(runtime, "reload_commands");
        await expect(executeCliCommand(command, "")).resolves.toBe("Reloaded commands!");
    });
});
