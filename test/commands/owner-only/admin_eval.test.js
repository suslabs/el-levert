import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("admin_eval command", () => {
    test("runs through the real eval parsing and repl path", async () => {
        const command = getCommand(runtime, "admin_eval");
        const msg = createCommandMessage("%admin_eval `1 + 1`", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        const out = await executeCommand(command, "`1 + 1`", { msg });

        expect(out).toEqual([
            "2",
            {
                type: "options",
                useConfigLimits: true
            }
        ]);
    });

    test("returns parser errors from evalBase unchanged", async () => {
        const command = getCommand(runtime, "admin_eval");
        const msg = createCommandMessage("%admin_eval broken", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        vi.spyOn(runtime.client.commandManager, "searchCommands").mockReturnValueOnce({
            evalBase: vi.fn().mockResolvedValue({
                body: null,
                err: ":warning: parse failed"
            })
        });

        await expect(executeCommand(command, "broken", { msg })).resolves.toBe(":warning: parse failed");
    });
});
