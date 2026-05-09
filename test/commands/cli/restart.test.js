import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createCommandRuntime, getCliCommand, executeCliCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false,
        config: {
            enableCliCommands: true
        }
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("cli restart command", () => {
    test("delegates to the real client restart path", async () => {
        const command = getCliCommand(runtime, "restart");
        const restartSpy = vi.spyOn(runtime.client, "restart").mockImplementation(async callback => {
            const configs = await callback();
            expect(configs).toHaveProperty("config");
            return 12.34;
        });

        await expect(executeCliCommand(command, "")).resolves.toBe("Restarted bot!");
        expect(restartSpy).toHaveBeenCalledOnce();
    });
});
