import { afterEach, beforeEach, describe, expect, test } from "vitest";

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

describe("help command", () => {
    test("renders help from the real command manager", async () => {
        const command = getCommand(runtime, "help");
        const msg = createCommandMessage("%help");

        const out = await executeCommand(command, "", { msg });

        expect(out).toContain("Available commands");
        expect(out).toContain("`tag/t`");
        expect(out).toContain("`help`");
    });
});
