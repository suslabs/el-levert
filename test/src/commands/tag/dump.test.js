import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
    addTag,
    cleanupRuntime,
    createCommandRuntime,
    getCommand,
    executeCommand
} from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "one");
    await addTag(runtime, "beta", "two");

    const secretTag = await addTag(runtime, "secret", "three");
    await runtime.client.tagManager.hide(secretTag);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag dump command", () => {
    test("dumps the real tag set as attachments", async () => {
        const command = getCommand(runtime, "tag");

        const inlineOut = await executeCommand(command, "dump inline");
        expect(inlineOut.files).toHaveLength(1);
        const inlineContent = inlineOut.files[0].attachment.toString();
        expect(inlineContent).toContain("alpha,beta");
        expect(inlineContent).not.toContain("secret");

        const allOut = await executeCommand(command, "dump inline --all");
        expect(allOut.files).toHaveLength(1);
        const allContent = allOut.files[0].attachment.toString();
        expect(allContent).toContain("secret (hidden)");

        const aliasAllOut = await executeCommand(command, "all inline");
        expect(aliasAllOut.files).toHaveLength(1);
        const aliasAllContent = aliasAllOut.files[0].attachment.toString();
        expect(aliasAllContent).toContain("secret (hidden)");

        const fullOut = await executeCommand(command, "dump full 2");
        expect(fullOut.files).toHaveLength(1);
        const fullContent = fullOut.files[0].attachment.toString();
        expect(fullContent).toContain("secret");
    });
});
