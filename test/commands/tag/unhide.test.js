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
    msg = createCommandMessage("%tag unhide");
    await addTag(runtime, "alpha", "body", msg.author.id);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag unhide command", () => {
    test("unhides tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");

        await executeCommand(command, "hide alpha", { msg });
        expect((await runtime.client.tagManager.fetch("alpha")).isHidden).toBe(true);

        await expect(executeCommand(command, "unhide alpha", { msg })).resolves.toContain("Unhid tag");

        const tag = await runtime.client.tagManager.fetch("alpha");
        expect(tag.isHidden).toBe(false);

        const listOut = await executeCommand(command, "list", { msg });
        expect(listOut.files[0].attachment.toString()).toContain("alpha");
        expect(listOut.files[0].attachment.toString()).not.toContain("alpha (hidden)");
    });

    test("fails if tag is not hidden", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "unhide alpha", { msg })).resolves.toContain("Tag is not hidden");
    });

    test("fails to unhide binary tags", async () => {
        const command = getCommand(runtime, "tag");

        await runtime.client.tagManager.add("bintag", new Uint8Array([1, 2, 3]), msg.author.id, { type: "binary" });

        await expect(executeCommand(command, "unhide bintag", { msg })).resolves.toContain(
            "Binary tags cannot be unhidden"
        );
    });

    test("fails if user is not tag owner or mod", async () => {
        const command = getCommand(runtime, "tag");
        await addTag(runtime, "other", "body", "someone_else");

        await expect(executeCommand(command, "unhide other", { msg })).resolves.toContain(
            "You can only unhide your own tags"
        );
    });
});
