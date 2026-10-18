import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Reminder from "../../../src/structures/Reminder.js";

import {
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;
let SnoozeUtil;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadHandlers: true,
        loadVMs: false
    });
    msg = createCommandMessage("%reminder snooze");
    SnoozeUtil = (await import("../../../src/util/commands/SnoozeUtil.js")).default;
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
        expect(out).not.toContain("Pay bill");

        const outWithIdx = await executeCommand(command, "snooze 1 30m", { msg });
        expect(outWithIdx).toContain("Reminder snoozed until");
        expect(outWithIdx).not.toContain("Pay bill");

        await expect(executeCommand(command, "snooze 5 10m", { msg })).resolves.toContain("doesn't exist");
    });

    test("creates a valid session with clonable CommandContext and handles snooze button interactions", async () => {
        const reminder = await runtime.client.reminderManager.add(
            msg.author.id,
            Date.now() + 60_000,
            "Clean room",
            false
        );

        const session = SnoozeUtil.createSession(msg.author, reminder);

        expect(session.context.constructor.name).toBe("CommandContext");
        expect(typeof session.context.clone).toBe("function");

        const clonedContext = session.context.clone({ isAuthor: true });
        expect(clonedContext.constructor.name).toBe("CommandContext");

        const replySpy = vi.fn().mockResolvedValue(true);
        const interaction = {
            isMessageComponent: () => true,
            isModalSubmit: () => false,
            customId: `snooze:5m:${session.id}`,
            user: msg.author,
            replied: false,
            deferred: false,
            reply: replySpy
        };

        const result = await runtime.client.interactionHandler.execute(interaction);
        expect(result).toBe(true);
        expect(replySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining("Reminder snoozed until"),
                ephemeral: true
            })
        );
        expect(replySpy.mock.calls[0][0].content).not.toContain("Clean room");
        expect(session.active).toBe(false);
    });

    test("rejects interactions from non-author callers", async () => {
        const reminder = await runtime.client.reminderManager.add(
            msg.author.id,
            Date.now() + 60_000,
            "Clean room",
            false
        );

        const session = SnoozeUtil.createSession(msg.author, reminder);
        const replyMock = vi.fn().mockResolvedValue(true);

        const interaction = {
            isMessageComponent: () => true,
            isModalSubmit: () => false,
            customId: `snooze:5m:${session.id}`,
            user: { id: "intruder-user" },
            replied: false,
            deferred: false,
            reply: replyMock
        };

        const result = await runtime.client.interactionHandler.execute(interaction);
        expect(result).toBe(true);
        expect(replyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining("Only the command caller can interact with this message"),
                ephemeral: true
            })
        );
        expect(session.active).toBe(true);
    });

    test("handles custom modal snooze workflow", async () => {
        const reminder = await runtime.client.reminderManager.add(
            msg.author.id,
            Date.now() + 60_000,
            "Walk dog",
            false
        );

        const session = SnoozeUtil.createSession(msg.author, reminder);
        const showModalSpy = vi.fn().mockResolvedValue(true);

        const customButtonInteraction = {
            isMessageComponent: () => true,
            isModalSubmit: () => false,
            customId: `snooze:custom:${session.id}`,
            user: msg.author,
            showModal: showModalSpy
        };

        const customResult = await runtime.client.interactionHandler.execute(customButtonInteraction);
        expect(customResult).toBe(true);
        expect(showModalSpy).toHaveBeenCalledTimes(1);

        const replySpy = vi.fn().mockResolvedValue(true);
        const modalSubmitInteraction = {
            isMessageComponent: () => false,
            isModalSubmit: () => true,
            customId: `snooze:modal:${session.id}`,
            user: msg.author,
            fields: {
                getTextInputValue: vi.fn().mockReturnValue("45m")
            },
            replied: false,
            deferred: false,
            reply: replySpy
        };

        const modalResult = await runtime.client.interactionHandler.execute(modalSubmitInteraction);
        expect(modalResult).toBe(true);
        expect(replySpy).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining("Reminder snoozed until"),
                ephemeral: true
            })
        );
        expect(replySpy.mock.calls[0][0].content).not.toContain("Walk dog");
        expect(session.active).toBe(false);
    });
});
