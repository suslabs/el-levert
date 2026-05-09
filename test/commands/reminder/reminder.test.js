import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder command", () => {
    test("shows the real reminder subcommand help", async () => {
        const command = getCommand(runtime, "reminder");
        await expect(executeCommand(command, "", { msg })).resolves.toContain("add|list|remove|remove_all");
    });
});
