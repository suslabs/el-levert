import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder add");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder add command", () => {
    test("validates input and creates reminders through the real database", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "add", { msg })).resolves.toContain('date "message"');
        await expect(executeCommand(command, 'add nonsense "Pay rent"', { msg })).resolves.toContain("Invalid date");
        await expect(executeCommand(command, 'add in 1 hour ""', { msg })).resolves.toContain("Invalid reminder message");
        await expect(executeCommand(command, 'add in 1 hour "Pay rent"', { msg })).resolves.toContain("You will be reminded");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let msg;

    beforeEach(async () => {
        runtime = await createCommandRuntime({
            loadVMs: false
        });
        msg = createCommandMessage("%reminder add", {
            author: {
                id: "user-1",
                username: "alex"
            }
        });
    });

    afterEach(async () => {
        await cleanupRuntime(runtime);
    });

    describe("reminder add command branches", () => {
        test("covers fallback parsing, escaped quotes, and reminder manager error branches", async () => {
            const command = getCommand(runtime, "reminder");
            const originalAdd = runtime.client.reminderManager.add.bind(runtime.client.reminderManager);

            await expect(executeCommand(command, 'add 1 hour "say \\"hi\\""', { msg })).resolves.toContain("You will be reminded");

            const savedReminder = await runtime.client.reminderManager.list(msg.author.id);
            expect(savedReminder.at(0).msg).toBe('say "hi"');

            runtime.client.reminderManager.add = async () => {
                const err = new Error("Invalid end time");
                err.name = "ReminderError";
                throw err;
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).resolves.toContain("time in the past");

            runtime.client.reminderManager.add = async () => {
                const err = new Error("Custom reminder failure");
                err.name = "ReminderError";
                throw err;
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).resolves.toContain("Custom reminder failure");

            runtime.client.reminderManager.add = async () => {
                throw new Error("unexpected");
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).rejects.toThrow("unexpected");

            runtime.client.reminderManager.add = originalAdd;
        });
    });
});
