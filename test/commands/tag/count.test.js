import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime();
    msg = createCommandMessage("%tag count", {
        author: {
            id: "user-1",
            username: "alex"
        }
    });
    await addTag(runtime, "alpha", "one", "user-1");
    await addTag(runtime, "beta", "two", "user-1");
    await addTag(runtime, "gamma", "three", "user-2");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag count command", () => {
    test("counts tags from the real database", async () => {
        const command = getCommand(runtime, "tag");

        await expect(executeCommand(command, "count me", { msg })).resolves.toContain("You have **2** tags");
        await expect(executeCommand(command, "count all", { msg })).resolves.toContain("There are **3**");
    });

    test("uses the cached user count for user-specific queries", async () => {
        const command = getCommand(runtime, "tag");

        await runtime.client.tagManager.tag_db.quotaCountSet("user-1", 7);

        await expect(executeCommand(command, "count me", { msg })).resolves.toContain("You have **7** tags");
        await expect(executeCommand(command, "count all", { msg })).resolves.toContain("There are **3**");
    });
});
