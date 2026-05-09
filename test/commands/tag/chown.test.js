import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag chown");
    await addTag(runtime, "alpha", "body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag chown command", () => {
    test("transfers ownership through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "chown alpha newowner", { msg })).resolves.toContain("Transferred tag");
        expect((await runtime.client.tagManager.fetch("alpha")).owner).toBe("newowner-id");
    });
});
