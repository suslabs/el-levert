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
    msg = createCommandMessage("%reminder edit");
    await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "Original task", false, 86_400_000);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder edit command", () => {
    test("edits reminder date only", async () => {
        const command = getCommand(runtime, "reminder");
        const out = await executeCommand(command, "edit 1 in 2 hours", { msg });

        expect(out).toContain("Updated reminder **1**");
        expect(out).toContain("Original task");

        const { items: reminders } = await runtime.client.reminderManager.list({ user: msg.author.id }, { all: true });
        expect(reminders[0].msg).toBe("Original task");
        expect(reminders[0].end).toBeGreaterThan(Date.now() + 3_600_000);
        expect(reminders[0].interval).toBe(86_400_000);
    });

    test("updates recurring interval and clears recurrence", async () => {
        const command = getCommand(runtime, "reminder");

        const outEvery = await executeCommand(command, "edit 1 --every 2d", { msg });
        expect(outEvery).toContain("Updated reminder **1**");
        expect(outEvery).toContain("(every 2 days)");

        let { items: reminders } = await runtime.client.reminderManager.list({ user: msg.author.id }, { all: true });
        expect(reminders[0].interval).toBe(172_800_000);

        const outClear = await executeCommand(command, "edit 1 --clear-every", { msg });
        expect(outClear).toContain("Updated reminder **1**");
        expect(outClear).not.toContain("every");

        ({ items: reminders } = await runtime.client.reminderManager.list({ user: msg.author.id }, { all: true }));
        expect(reminders[0].interval).toBeNull();
    });

    test("edits both date and recurring interval simultaneously", async () => {
        const command = getCommand(runtime, "reminder");
        const out = await executeCommand(command, "edit 1 in 3 hours --every 5h", { msg });

        expect(out).toContain("Updated reminder **1**");
        expect(out).toContain("(every 5 hours)");

        const { items: reminders } = await runtime.client.reminderManager.list({ user: msg.author.id }, { all: true });

        expect(reminders[0].msg).toBe("Original task");
        expect(reminders[0].end).toBeGreaterThan(Date.now() + 7_200_000);
        expect(reminders[0].interval).toBe(18_000_000);
    });

    test("works with aliases change and modify", async () => {
        const command = getCommand(runtime, "reminder");

        const out1 = await executeCommand(command, "change 1 in 4 hours", { msg });
        expect(out1).toContain("Updated reminder **1**");

        const out2 = await executeCommand(command, "modify 1 --every 12h", { msg });
        expect(out2).toContain("Updated reminder **1**");
        expect(out2).toContain("(every 12 hours)");
    });

    test("handles validation errors and edge cases", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "edit", { msg })).resolves.toContain("<index>");
        await expect(executeCommand(command, "edit abc", { msg })).resolves.toContain("<index>");
        await expect(executeCommand(command, "edit 0", { msg })).resolves.toContain("<index>");
        await expect(executeCommand(command, "edit 99 in 1 hour", { msg })).resolves.toContain("doesn't exist");
        await expect(executeCommand(command, "edit 1", { msg })).resolves.toContain("<index>");
        await expect(executeCommand(command, "edit 1 invalid_date", { msg })).resolves.toContain("Invalid date");
        await expect(executeCommand(command, "edit 1 in 1 hour --every 10s", { msg })).resolves.toContain(
            "Repeat interval must be at least 1 minute"
        );
        await expect(executeCommand(command, "edit 1 in 1 hour --every invalid", { msg })).resolves.toContain(
            "Invalid recurring interval"
        );
        await expect(executeCommand(command, "edit 1 yesterday", { msg })).resolves.toContain(
            "Can't set a reminder for a time in the past"
        );
    });
});
