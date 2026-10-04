import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addTag,
    cleanupRuntime,
    createCommandMessage,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag hide");
    await addTag(runtime, "alpha", "body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag hide command", () => {
    test("hides tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "hide alpha", { msg })).resolves.toContain("Hid tag");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.isHidden).toBe(true);

        const listOut = await executeCommand(command, "list", { msg });
        expect(listOut.files[0].attachment.toString()).toContain("alpha (hidden)");

        const searchRes = await runtime.client.tagManager.search("alpha");
        expect(searchRes.results).toEqual([]);
    });

    test("fails if tag is already hidden", async () => {
        const command = getCommand(runtime, "tag");

        await executeCommand(command, "hide alpha", { msg });
        await expect(executeCommand(command, "hide alpha", { msg })).resolves.toContain("Tag is already hidden");
    });

    test("fails if user is not tag owner or mod", async () => {
        const command = getCommand(runtime, "tag");
        await addTag(runtime, "other", "body", "someone_else");

        await expect(executeCommand(command, "hide other", { msg })).resolves.toContain(
            "You can only hide your own tags"
        );
    });
});
