import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime, executeCommand, getCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("convert command", () => {
    test("validates inputs and formats converted values", async () => {
        const command = getCommand(runtime, "convert");

        await expect(executeCommand(command, "")).resolves.toContain("convert");
        await expect(executeCommand(command, "abc eu rf")).resolves.toContain("Invalid input value");
        await expect(executeCommand(command, "1 eu rf")).resolves.toContain("4 RF/t");
    });
});
