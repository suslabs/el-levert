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

describe("cli help command", () => {
    test("lists the real CLI commands", async () => {
        const command = getCliCommand(runtime, "help");
        const out = await executeCliCommand(command, "");

        expect(out).toContain("Available commands");
        expect(out).toContain("reload_commands");
        expect(out).toContain("version");
    });
});
