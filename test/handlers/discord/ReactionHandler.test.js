import { ChannelType } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let ReactionHandler;
let handler;

async function createHandler(reactions) {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        reactions,
        clientOverrides: {
            client: {
                user: {
                    id: "bot"
                }
            }
        }
    });

    ({ default: ReactionHandler } = await import("../../../src/handlers/discord/ReactionHandler.js"));

    handler = new ReactionHandler(true);
    handler.load();
}

function createReactingMessage(content, reacts = []) {
    return createDiscordMessage(content, {
        author: {
            id: "u",
            username: "alex"
        },
        channel: {
            id: "c",
            name: "general",
            type: ChannelType.GuildText,
            sendTyping: () => Promise.resolve(undefined)
        },
        react: vi.fn(emoji =>
            Promise.resolve({
                emoji,
                users: {
                    remove: vi.fn(() => Promise.resolve(undefined))
                }
            }).then(reaction => {
                reacts.push(reaction);
                return reaction;
            })
        )
    });
}

afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupRuntime(runtime);

    runtime = null;
    handler = null;
});

describe("ReactionHandler", () => {
    beforeEach(async () => {
        await createHandler({
            multipleReacts: false,
            funnyWords: [
                {
                    word: "leveret",
                    emoji: ":)"
                },
                {
                    word: "rabbit",
                    emoji: ":D"
                }
            ],
            parens: {
                left: [")", "]"],
                right: ["(", "["]
            }
        });
    });

    test("matches words outside code blocks and preserves their source order", () => {
        expect(handler._getWordCounts("cleveret rabbit `leveret` leveret rabbit")).toEqual({
            rabbit: 1,
            leveret: 1
        });

        expect(handler._getReactionPlan("rabbit ```leveret``` leveret").words).toEqual(["rabbit", "leveret"]);
        expect(handler._getReactionPlan("rabbit ```leveret``` leveret").emojis).toEqual([":D", ":)"]);
    });

    test("ignores emoticon parentheses and code blocks when counting unmatched parens", () => {
        const onlyOpen = handler._countUnmatchedParens("(: hello :) ```((``` ((");
        expect(onlyOpen).toEqual({
            left: 2,
            right: 0,
            total: 2
        });

        const onlyClose = handler._countUnmatchedParens("```)))``` ) :-)");
        expect(onlyClose).toEqual({
            left: 0,
            right: 1,
            total: 1
        });
    });

    test("batches ordered word and paren reactions together", async () => {
        const reacts = [],
            msg = createReactingMessage("rabbit ```leveret``` ((", reacts);

        await expect(handler.execute(msg)).resolves.toBe(true);
        expect(msg.react.mock.calls.map(([emoji]) => emoji)).toEqual([":D", "(", "["]);

        await handler.resubmit(msg);
        expect(reacts.every(reaction => typeof reaction.users.remove === "function")).toBe(true);
    });

    test("diffs tracked reactions on edit before applying changes", async () => {
        const reacts = [],
            msg = createReactingMessage("rabbit leveret", reacts);

        await expect(handler.execute(msg)).resolves.toBe(true);
        expect(msg.react.mock.calls.map(([emoji]) => emoji)).toEqual([":D", ":)"]);

        msg.content = "rabbit";
        await expect(handler.resubmit(msg)).resolves.toBe(true);

        expect(msg.react.mock.calls.map(([emoji]) => emoji)).toEqual([":D", ":)"]);
        expect(reacts.find(reaction => reaction.emoji === ":D").users.remove).not.toHaveBeenCalled();
        expect(reacts.find(reaction => reaction.emoji === ":)").users.remove).toHaveBeenCalledTimes(1);
    });

    test("skips DMs", async () => {
        const dmMsg = createDiscordMessage("rabbit", {
            channel: {
                type: ChannelType.DM
            }
        });

        await expect(handler.execute(dmMsg)).resolves.toBe(false);
    });

    test("swallows reaction failures after planning reactions", async () => {
        const msg = createDiscordMessage("rabbit ((", {
            author: {
                id: "u",
                username: "alex"
            },
            channel: {
                id: "c",
                name: "general",
                type: ChannelType.GuildText,
                sendTyping: () => Promise.resolve(undefined)
            },
            react: vi.fn(() => Promise.reject(new Error("react failed")))
        });

        await expect(handler.execute(msg)).resolves.toBe(true);
    });
});

describe("ReactionHandler with multiple reacts", () => {
    beforeEach(async () => {
        await createHandler({
            multipleReacts: true,
            funnyWords: [
                {
                    word: "rabbit",
                    emojis: [":D", ":P"]
                },
                {
                    word: "leveret",
                    emoji: ":)"
                }
            ],
            parens: {
                left: [")"],
                right: ["("]
            }
        });
    });

    test("keeps repeated word hits in source order before batching unique emojis", () => {
        vi.spyOn(Math, "random")
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.999999);

        const plan = handler._getReactionPlan("rabbit leveret rabbit");
        expect(plan.words).toEqual(["rabbit", "leveret"]);
        expect(plan.emojis).toEqual([":D", ":)", ":P"]);
    });

    test("reacts from repeated matches and ignores code-blocked words", async () => {
        vi.spyOn(Math, "random")
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0.999999);

        const msg = createReactingMessage("rabbit `rabbit` leveret rabbit");

        await expect(handler.execute(msg)).resolves.toBe(true);
        expect(msg.react.mock.calls.map(([emoji]) => emoji)).toEqual([":D", ":)", ":P"]);
    });
});
