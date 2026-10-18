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
    msg = createCommandMessage("%reminder add");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder add command", () => {
    test("validates input and creates reminders through the real database", async () => {
        const command = getCommand(runtime, "reminder");

        await expect(executeCommand(command, "add", { msg })).resolves.toContain('<date> ["message"]');
        await expect(executeCommand(command, 'add nonsense "Pay rent"', { msg })).resolves.toContain("Invalid date");
        await expect(executeCommand(command, 'add in 1 hour ""', { msg })).resolves.toContain(
            "Invalid reminder message"
        );
        await expect(executeCommand(command, 'add in 1 hour "Pay rent"', { msg })).resolves.toContain(
            "You will be reminded"
        );
        await expect(executeCommand(command, 'add every 1d "Standup meeting"', { msg })).resolves.toContain(
            "(every 1 day)"
        );
        await expect(executeCommand(command, 'add every 10d 12:46 "Check backups"', { msg })).resolves.toContain(
            "(every 1 week, 3 days)"
        );
        await expect(executeCommand(command, 'add 12:46 every 1d "Standup"', { msg })).resolves.toContain(
            "(every 1 day)"
        );
        await expect(executeCommand(command, 'add 12:46 "Take meds" --every 1d', { msg })).resolves.toContain(
            "(every 1 day)"
        );
        await expect(executeCommand(command, 'add 12:46 "Test" --every invalid', { msg })).resolves.toContain(
            "Invalid recurring interval"
        );
        await expect(executeCommand(command, 'add every 30s "Standup"', { msg })).resolves.toContain(
            "Repeat interval must be at least 1 minute"
        );
        await expect(executeCommand(command, 'add 12:46 "Test" --every 10s', { msg })).resolves.toContain(
            "Repeat interval must be at least 1 minute"
        );
    });

    test("extracts and trims reply message content when message argument is omitted", async () => {
        const command = getCommand(runtime, "reminder");

        const replyMsg = {
            id: "msg-12345",
            channelId: "ch-67890",
            guildId: "guild-111",
            content: "Check this important task tomorrow",
            url: "https://discord.com/channels/guild-111/ch-67890/msg-12345"
        };

        const res = await executeCommand(command, "add 1 hour", { msg, replyMsg });
        expect(res).toContain("You will be reminded");
        expect(res).toContain("Check this important task tomorrow");
        expect(res).toContain("https://discord.com/channels/guild-111/ch-67890/msg-12345");
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

            await expect(executeCommand(command, 'add 1 hour "say \\"hi\\""', { msg })).resolves.toContain(
                "You will be reminded"
            );

            const savedReminder = await runtime.client.reminderManager.list(msg.author.id);
            expect(savedReminder.at(0).msg).toBe('say "hi"');

            runtime.client.reminderManager.add = async () => {
                const err = new Error("Invalid end time");
                err.name = "ReminderError";
                throw err;
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).resolves.toContain(
                "time in the past"
            );

            runtime.client.reminderManager.add = async () => {
                const err = new Error("Custom reminder failure");
                err.name = "ReminderError";
                throw err;
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).resolves.toContain(
                "Custom reminder failure"
            );

            runtime.client.reminderManager.add = async () => {
                throw new Error("unexpected");
            };

            await expect(executeCommand(command, 'add tomorrow "late"', { msg })).rejects.toThrow("unexpected");

            runtime.client.reminderManager.add = originalAdd;
        });
    });
});
