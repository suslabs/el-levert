import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "one");
    await addTag(runtime, "alpine", "two");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag search command", () => {
    test("searches tag names through the real fuzzy search path", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "search alp 2");

        expect(out).toContain("similar tag");
        expect(out).toContain("alpha");
    });
});
