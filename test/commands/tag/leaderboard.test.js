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
});
