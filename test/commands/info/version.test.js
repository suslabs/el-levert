import { afterEach, beforeEach, describe, expect, test } from "vitest";

import version from "../../../version.js";

import { cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        loadVMs: false
    });
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("version command", () => {
    test("returns the live client version", async () => {
        const command = getCommand(runtime, "version");
        await expect(executeCommand(command, "")).resolves.toContain(version);
    });
});
