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

beforeEach(async () => {
    runtime = await createCommandRuntime({
        clientOverrides: {
            findUsers: async query => {
                if (query === "unknown") {
                    return [];
                }

                return [
                    {
                        id: query,
                        user: { id: query, username: query }
                    }
                ];
            }
        }
    });
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

    test("renders user leaderboard positions in text without tag list", async () => {
        const command = getCommand(runtime, "tag");

        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));
        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));

        const defaultOut = await executeCommand(command, "leaderboard user");
        expect(defaultOut).toContain("Your leaderboard positions:");
        expect(defaultOut).toContain("Count: **#1** (2 tags)");
        expect(defaultOut).toContain("Size: **#1**");

        const otherUserOut = await executeCommand(command, "leaderboard user user-2");
        expect(otherUserOut).toContain("User `user-2`'s leaderboard positions:");

        const directOut = await executeCommand(command, "leaderboard user-2");
        expect(directOut).toContain("User `user-2`'s leaderboard positions:");

        const selfTargetOut = await executeCommand(command, "leaderboard user user-1");
        expect(selfTargetOut).toContain("Your leaderboard positions:");
    });

    test("renders user tag usage leaderboard filtering zero-usage tags without codeblocks", async () => {
        const command = getCommand(runtime, "tag");

        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));
        await runtime.client.tagManager.execute(await runtime.client.tagManager.fetch("alpha"));

        const usesUserOut = await executeCommand(command, "leaderboard uses user");
        expect(usesUserOut.content).toContain("Your tag usage:");
        expect(usesUserOut.embeds).toHaveLength(1);
        expect(usesUserOut.embeds[0].data.description).toContain("1. `alpha`: **2** uses");
        expect(usesUserOut.embeds[0].data.description).not.toContain("beta");
        expect(usesUserOut.embeds[0].data.description).not.toContain("```");

        const selfUsageOut = await executeCommand(command, "leaderboard user uses");
        expect(selfUsageOut.content).toContain("Your tag usage:");
        expect(selfUsageOut.embeds).toHaveLength(1);
        expect(selfUsageOut.embeds[0].data.description).toContain("1. `alpha`: **2** uses");
        expect(selfUsageOut.embeds[0].data.description).not.toContain("beta");
        expect(selfUsageOut.embeds[0].data.description).not.toContain("```");

        const targetUsageOut = await executeCommand(command, "leaderboard user user-1 uses");
        expect(targetUsageOut.content).toContain("Your tag usage:");
        expect(targetUsageOut.embeds[0].data.description).toContain("1. `alpha`: **2** uses");
        expect(targetUsageOut.embeds[0].data.description).not.toContain("beta");

        const directUsageOut = await executeCommand(command, "leaderboard uses user-1");
        expect(directUsageOut.content).toContain("Your tag usage:");
        expect(directUsageOut.embeds[0].data.description).toContain("1. `alpha`: **2** uses");

        const noUsageOut = await executeCommand(command, "leaderboard user user-2 uses");
        expect(noUsageOut).toContain("User `user-2` has **no** tags with usage.");

        const noUsageUsesUser2 = await executeCommand(command, "leaderboard uses user-2");
        expect(noUsageUsesUser2).toContain("User `user-2` has **no** tags with usage.");
    });

    test("handles user leaderboard errors and empty tag states", async () => {
        const command = getCommand(runtime, "tag");

        const unknownUser = await executeCommand(command, "leaderboard user unknown");
        expect(unknownUser).toContain("User `unknown` has **no** tags.");

        const emptyMsg = createCommandMessage("", {
            author: { id: "empty-author", username: "empty-author" }
        });
        const emptyAuthor = await executeCommand(command, "leaderboard user", { msg: emptyMsg });
        expect(emptyAuthor).toContain("You have **no** tags.");
    });
});
