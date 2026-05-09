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

describe("cli clear command", () => {
    test("clears the console through the real CLI command manager", async () => {
        const command = getCliCommand(runtime, "clear");
        const clearSpy = vi.spyOn(console, "clear").mockImplementation(() => {});

        await expect(executeCliCommand(command, "")).resolves.toBeUndefined();
        expect(clearSpy).toHaveBeenCalledOnce();
    });
});
