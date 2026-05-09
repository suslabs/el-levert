import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag list");
    await addTag(runtime, "alpha", "one", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag list command", () => {
    test("lists user tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "list", { msg });

        expect(out.content).toContain("You have the following tags");
        expect(out.files).toHaveLength(1);
    });
});
