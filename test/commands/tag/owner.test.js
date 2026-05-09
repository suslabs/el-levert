import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { addTag, cleanupRuntime, createCommandMessage, createCommandRuntime, getCommand, executeCommand } from "../../helpers/commandHarness.js";

let runtime;
let msg;

beforeEach(async () => {
    runtime = await createCommandRuntime({
        discordOverrides: {
            findUsers: async query => {
                if (query === "user-1") {
                    return [
                        {
                            id: "user-1",
                            user: {
                                id: "user-1",
                                username: "owner"
                            },
                            nickname: "nick"
                        }
                    ];
                }

                return [];
            },
            findUserById: async id => ({
                id,
                username: "owner",
                user: {
                    id,
                    username: "owner"
                }
            })
        }
    });

    msg = createCommandMessage("%tag owner", {
        guild: {
            id: "guild-1"
        }
    });
    await addTag(runtime, "alpha", "body", "user-1");
});

afterEach(async () => {
    await cleanupRuntime(runtime);
});

describe("tag owner command", () => {
    test("resolves tag ownership through the real tag structure", async () => {
        const command = getCommand(runtime, "tag");
        await expect(executeCommand(command, "owner alpha", { msg })).resolves.toContain("also known as");
    });
});
