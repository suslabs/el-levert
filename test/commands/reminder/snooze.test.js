import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder snooze");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder snooze command", () => {
    test("validates input and snoozes reminders through reminderManager", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "snooze", { msg })).resolves.toContain("[index] <duration>");
        await expect(executeCommand(command, "snooze nonsense", { msg })).resolves.toContain("Invalid duration");

        await expect(executeCommand(command, "snooze 10m", { msg })).resolves.toContain(
            "You don't have any reminders to snooze."
        );

        await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "Pay bill", false);

        const out = await executeCommand(command, "snooze 15m", { msg });
        expect(out).toContain("Reminder snoozed until");

        const outWithIdx = await executeCommand(command, "snooze 1 30m", { msg });
        expect(outWithIdx).toContain("Reminder snoozed until");

        await expect(executeCommand(command, "snooze 5 10m", { msg })).resolves.toContain("doesn't exist");
    });
});
