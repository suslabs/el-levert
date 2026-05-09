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

describe("cli stop command", () => {
    test("delegates to the real client stop method", async () => {
        const command = getCliCommand(runtime, "stop");
        const stopSpy = vi.spyOn(runtime.client, "stop").mockResolvedValue(0);

        await expect(executeCliCommand(command, "")).resolves.toBeUndefined();
        expect(stopSpy).toHaveBeenCalledWith(true);
    });
});
