import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
    msg = createCommandMessage("%reminder list");
    await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "Pay rent", false);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("reminder list command", () => {
    test("lists reminders from the real database", async () => {
        const command = getCommand(runtime, "reminder");
        const out = await executeCommand(command, "list", { msg });

        expect(out.content).toContain("Your reminders");
        expect(out.embeds).toHaveLength(1);
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let msg;

    beforeEach(async () => {
        runtime = await createCommandRuntime({
            loadVMs: false
        });
        msg = createCommandMessage("%reminder list");
    });

    afterEach(async () => {
        await cleanupRuntime(runtime);
    });

    describe("reminder list command branches", () => {
        test("covers empty and populated reminder output", async () => {
            const command = getCommand(runtime, "reminder");

            await expect(executeCommand(command, "list", { msg })).resolves.toBe(
                ":information_source: You have **no** reminders."
            );

            await runtime.client.reminderManager.add(msg.author.id, Date.now() + 60_000, "first reminder", false);
            await runtime.client.reminderManager.add(msg.author.id, Date.now() + 120_000, "second reminder", false);

            const out = await executeCommand(command, "list", { msg });

            expect(out.content).toBe(":information_source: Your reminders:");
            expect(out.embeds).toHaveLength(1);
            expect(out.embeds[0].data.description).toContain("1. On ");
            expect(out.embeds[0].data.description).toContain("2. On ");
        });
    });
});
