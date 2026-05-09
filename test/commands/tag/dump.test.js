import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "one");
    await addTag(runtime, "beta", "two");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag dump command", () => {
    test("dumps the real tag set as attachments", async () => {
        const command = getCommand(runtime, "tag");

        const inlineOut = await executeCommand(command, "dump inline");
        expect(inlineOut.files).toHaveLength(1);

        const fullOut = await executeCommand(command, "dump full 2");
        expect(fullOut.files).toHaveLength(1);
    });
});
