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
    runtime = await createCommandRuntime({ loadHandlers: true });
    msg = createCommandMessage("%tag list");
    await addTag(runtime, "alpha", "one", msg.author.id);

    const secretTag = await addTag(runtime, "secret", "shh", msg.author.id);
    await runtime.client.tagManager.hide(secretTag);
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag list command", () => {
    test("lists user tags through the real tag manager", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "list", { msg });

        expect(out.content).toContain("You have the following tags");
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.description).toContain("alpha");
        expect(out.embeds[0].data.description).not.toContain("secret");
    });

    test("paginates user tags when multiple pages exist", async () => {
        await addTag(runtime, "beta", "two", msg.author.id);
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "list --limit 1", { msg });

        expect(out.content).toContain("You have the following tags");
        expect(out.embeds).toHaveLength(1);
        expect(out.components).toHaveLength(1);
    });

    test("dumps all user tags via --all including hidden tags", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "list --all", { msg });

        expect(out.content).toContain("You have the following tags");
        expect(out.embeds).toHaveLength(1);
        expect(out.embeds[0].data.description).toContain("alpha");
        expect(out.embeds[0].data.description).toContain("secret (hidden)");
    });
});
