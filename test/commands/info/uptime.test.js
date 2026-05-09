import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    runtime.client.startedAt = Date.UTC(2026, 0, 1, 0, 0, 0);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("uptime command", () => {
    test("formats the real client uptime", async () => {
        const command = getCommand(runtime, "uptime");
        const out = await executeCommand(command, "");

        expect(out).toContain("The bot has been running for");
        expect(out).toContain("since **Thu, 01/01/2026");
    });
});
