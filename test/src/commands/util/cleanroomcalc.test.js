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

describe("cleanroomcalc command", () => {
    test("validates dimensions and returns a resource embed", async () => {
        const command = getCommand(runtime, "cleanroomcalc");

        await expect(executeCommand(command, "1x2")).resolves.toContain("LxWxH");
        await expect(executeCommand(command, "axbxc")).resolves.toContain("Invalid dimensions");

        const out = await executeCommand(command, "5x5x5");
        expect(out.content).toContain("cleanroom");
        expect(out.embeds).toHaveLength(1);
    });
});
