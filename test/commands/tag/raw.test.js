import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "body");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag raw command", () => {
    test("returns raw tag data through the real tag structure", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "raw alpha");

        expect(out.files).toHaveLength(1);
    });
});
