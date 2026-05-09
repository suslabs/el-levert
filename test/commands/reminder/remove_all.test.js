import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder remove_all");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder remove_all command", () => {
    test("removes all reminders from the real database", async () => {
        const command = getCommand(runtime, "reminder");

        await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "Pay rent", false);
        await expect(executeCommand(command, "remove_all", { msg })).resolves.toContain("Removed all reminders");
        await expect(executeCommand(command, "remove_all", { msg })).resolves.toContain("don't have any reminders");
    });
});
