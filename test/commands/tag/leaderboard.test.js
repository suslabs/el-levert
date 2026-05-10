import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    await addTag(runtime, "alpha", "one", "user-1");
    await addTag(runtime, "beta", "two", "user-1");
    await addTag(runtime, "gamma", "three", "user-2");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag leaderboard command", () => {
    test("renders leaderboard data from the real tag manager", async () => {
        const command = getCommand(runtime, "tag");
        const out = await executeCommand(command, "leaderboard count 2");

        expect(out.content).toContain("leaderboard");
        expect(out.embeds).toHaveLength(1);
    });

    test("marks deleted historical tags in the usage leaderboard", async () => {
        const command = getCommand(runtime, "tag");

        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));
        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));
        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("beta"));
        await runtime.client.tagManager.delete(await runtime.client.tagManager.fetch("beta"));

        const out = await executeCommand(command, "leaderboard usage 2");

        expect(out).toMatchObject({
            content: ":information_source: Tag usage leaderboard:"
        });
        expect(out.embeds[0].data.description).toContain("`alpha`");
        expect(out.embeds[0].data.description).toContain("**2** uses");
        expect(out.embeds[0].data.description).toContain("`beta*`");
    });
});
