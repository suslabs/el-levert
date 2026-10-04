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
    await addTag(runtime, "alpha", "first second third fourth");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag fullsearch command", () => {
    test("full-searches tag bodies through the real database", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "fullsearch second");

        expect(out.content).toContain("matching tag");
        expect(out.embeds).toHaveLength(1);
    });

    test("excludes hidden and binary tags from fullsearch", async () => {
        const command = getCommand(runtime, "tag");

        await addTag(runtime, "hiddenone", "second hidden body");
        const hiddenTag = await runtime.client.tagManager.fetch("hiddenone");
        await runtime.client.tagManager.hide(hiddenTag);

        const out = await executeCommand(command, "fullsearch second");
        expect(out.content).toContain("Found **1** matching tag");
        expect(out.embeds[0].data.description).toContain("alpha");
        expect(out.embeds[0].data.description).not.toContain("hiddenone");
    });
});
