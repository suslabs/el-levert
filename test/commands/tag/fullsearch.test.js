import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "first second third fourth");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag fullsearch command", () => {
    test("full-searches tag bodies through the real database", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "fullsearch second");

        expect(out.content).toContain("matching tag");
        expect(out.embeds).toHaveLength(1);
    });
});
