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
    runtime.client.startedAt = Date.UTC(2026, 0, 1, 0, 0, 0);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("cli uptime command", () => {
    test("formats the live client uptime", async () => {
        const command = getCliCommand(runtime, "uptime");
        const out = await executeCliCommand(command, "");

        expect(out).toContain("The bot has been running for");
        expect(out).toContain("01/01/2026");
    });
});
