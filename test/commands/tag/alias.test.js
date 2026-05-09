import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag alias");
    await addTag(runtime, "target", "target body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag alias command", () => {
    test("creates aliases through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "alias alias_name target args", { msg })).resolves.toContain("aliased");
        expect(await runtime.client.tagManager.fetch("alias_name")).toMatchObject({
            aliasName: "target"
        });
    });
});
