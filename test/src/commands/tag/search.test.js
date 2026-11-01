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
    await addTag(runtime, "alpine", "two");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag search command", () => {
    test("searches tag names through the real fuzzy search path", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "search alp 2");

        const content = out.content ?? out;
        expect(content).toContain("similar tag");
        expect(content).toContain("alpha");
    });

    test("does not return hidden tags in search", async () => {
        const command = getCommand(runtime, "tag");

        const alpha = await runtime.client.tagManager.fetch("alpha");
        await runtime.client.tagManager.hide(alpha);

        const out = await executeCommand(command, "search alpha 2");
        expect(out).toContain("Found **no** similar tags");
    });

    test("finds longer tags matching short query prefix and supports all flag", async () => {
        await addTag(runtime, "ck_base2n", "one");
        await addTag(runtime, "ck_fastgif", "two");

        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "search ck all");

        const content = out.content ?? out;
        expect(content).toContain("Found **2** similar tags");
        expect(content).toContain("ck_base2n");
        expect(content).toContain("ck_fastgif");
    });

    test("matches tags at token boundaries and rejects mid-word matches", async () => {
        await addTag(runtime, "ck_base2n", "one");
        await addTag(runtime, "backpack", "two");

        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "search ck all");

        const content = out.content ?? out;
        expect(content).toContain("ck_base2n");
        expect(content).not.toContain("backpack");
    });

    test("tolerates single typos on longer tag names", async () => {
        await addTag(runtime, "ck_font_customemoji", "one");

        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "search customemji 5");

        const content = out.content ?? out;
        expect(content).toContain("ck_font_customemoji");
    });
});
