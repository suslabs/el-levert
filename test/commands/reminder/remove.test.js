import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder remove");
    await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "Pay rent", false);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder remove command", () => {
    test("removes reminders by index", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "remove nope", { msg })).resolves.toContain("index");
        await expect(executeCommand(command, "remove 2", { msg })).resolves.toContain("doesn't exist");
        await expect(executeCommand(command, "remove 1", { msg })).resolves.toContain("Removed reminder");
    });

    test("covers empty input, invalid indexes, empty reminders, and error branches", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "remove", { msg })).resolves.toContain("index");
        await expect(executeCommand(command, "remove 0", { msg })).resolves.toContain("Invalid reminder index");

        vi.spyOn(runtime.client.reminderManager, "remove").mockResolvedValueOnce(null);
        await expect(executeCommand(command, "remove 1", { msg })).resolves.toContain("don't have any reminders");

        const reminderErr = new Error("Bad reminder");
        reminderErr.name = "ReminderError";

        vi.spyOn(runtime.client.reminderManager, "remove").mockRejectedValueOnce(reminderErr);
        await expect(executeCommand(command, "remove 1", { msg })).resolves.toContain("Bad reminder");

        vi.spyOn(runtime.client.reminderManager, "remove").mockRejectedValueOnce(new Error("boom"));
        await expect(executeCommand(command, "remove 1", { msg })).rejects.toThrow("boom");
    });
});
