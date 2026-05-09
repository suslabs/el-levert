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

describe("stoik command", () => {
    test("requires an equation and renders balance information", async () => {
        const command = getCommand(runtime, "stoik");

        await expect(executeCommand(command, "")).resolves.toContain("No expression provided");

        const out = await executeCommand(command, "H2 + O2 -> H2O");
        expect(out.content).toContain("balanced");
        expect(out.embeds).toHaveLength(1);
    });
});
