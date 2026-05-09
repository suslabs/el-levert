import { afterEach, beforeEach, describe, expect, test } from "vitest";

import version from "../../../version.js";

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

describe("cli version command", () => {
    test("returns the current bot version", async () => {
        const command = getCliCommand(runtime, "version");
        await expect(executeCliCommand(command, "")).resolves.toContain(version);
    });
});
