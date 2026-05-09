import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("owner reload_commands command", () => {
    test("reloads the real command set and reports totals", async () => {
        const command = getCommand(runtime, "reload_commands");
        const msg = createCommandMessage("%reload_commands", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        const out = await executeCommand(command, "", { msg });

        expect(out).toContain("Reloaded");
        expect(out).toContain("successful");
    });

    test("covers failed, empty, and singular reload result branches", async () => {
        const command = getCommand(runtime, "reload_commands");
        const msg = createCommandMessage("%reload_commands", {
            author: {
                id: "owner-id",
                username: "owner"
            }
        });

        const silenceSpy = vi.spyOn(runtime.client, "silenceDiscordTransports");

        vi.spyOn(runtime.client.commandManager, "reloadCommands").mockResolvedValueOnce(null);
        await expect(executeCommand(command, "", { msg })).resolves.toContain("Reloading commands failed");

        vi.spyOn(runtime.client.commandManager, "reloadCommands").mockResolvedValueOnce({
            ok: 0,
            bad: 0,
            total: 0
        });
        await expect(executeCommand(command, "", { msg })).resolves.toContain("No commands were reloaded");

        vi.spyOn(runtime.client.commandManager, "reloadCommands").mockResolvedValueOnce({
            ok: 1,
            bad: 0,
            total: 1
        });
        await expect(executeCommand(command, "", { msg })).resolves.toContain("Reloaded **1** command.");

        expect(silenceSpy).toHaveBeenCalledWith(true);
        expect(silenceSpy).toHaveBeenCalledWith(false);
    });
});
