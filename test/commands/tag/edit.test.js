import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag edit");
    await addTag(runtime, "alpha", "body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag edit command", () => {
    test("edits tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "edit alpha new body", { msg })).resolves.toContain("Edited tag");
        expect((await runtime.client.tagManager.fetch("alpha")).body).toBe("new body");
    });
});
