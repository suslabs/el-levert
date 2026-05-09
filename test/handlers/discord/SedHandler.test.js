import { MessageType } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let SedHandler;
let handler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: SedHandler } = await import("../../../src/handlers/discord/SedHandler.js"));

    handler = new SedHandler(true);
    handler.load();
});

afterEach(async () => {
    handler?.unload?.();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("SedHandler", () => {
    test("detects sed commands and finds the latest matching message", async () => {
        expect(handler.canSed("sed/foo/bar/")).toBe(true);
        expect(handler.canSed("hello")).toBe(false);

        runtime.client.fetchMessages = async () => [
            { id: "1", author: { id: runtime.client.botId }, content: "skip" },
            { id: "2", author: { id: "user" }, content: "sed/foo/bar/" },
            { id: "3", author: { id: "user" }, content: "hello foo" }
        ];

        const match = await handler._fetchMatch("channel", /foo/g, "0");
        expect(match.id).toBe("3");
    });

    test("generates replacement embeds and handles invalid input errors", async () => {
        runtime.client.fetchMessage = async () => ({
            content: "hello foo",
            attachments: [],
            author: {
                displayName: "Poster",
                displayAvatarURL: () => "https://example.com/avatar.png"
            },
            channel: {
                name: "general",
                type: 0
            },
            createdTimestamp: 1000
        });

        const replyMsg = createDiscordMessage("sed/foo/bar/", {
            type: MessageType.Reply,
            reference: {
                messageId: "1"
            },
            channel: {
                id: "2",
                name: "general",
                type: 0,
                sendTyping: async () => undefined
            },
            author: {
                id: "3",
                username: "Caller"
            },
            reply: vi.fn(async data => data)
        });

        const embed = await handler.generateSed(replyMsg, replyMsg.content);
        expect(embed.data.description).toContain("hello bar");

        await expect(handler.execute(createDiscordMessage("sed", { reply: vi.fn() }))).resolves.toBe(false);

        runtime.client.fetchMessage = async () => ({
            content: "no match here",
            attachments: [],
            author: {
                displayName: "Poster",
                displayAvatarURL: () => "https://example.com/avatar.png"
            },
            channel: {
                name: "general",
                type: 0
            },
            createdTimestamp: 1000
        });

        await expect(handler.execute(replyMsg)).resolves.toBe(true);
        expect(replyMsg.reply).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.stringContaining("No matching text found")
            })
        );
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let SedHandler;
    let handler;

    beforeEach(async () => {
        runtime = await createRuntime({
            loadManagers: false,
            loadVMs: false
        });

        ({ default: SedHandler } = await import("../../../src/handlers/discord/SedHandler.js"));

        handler = new SedHandler(true);
        handler.load();
    });

    afterEach(async () => {
        handler?.unload?.();
        await cleanupRuntime(runtime);
        runtime = null;
    });

    describe("SedHandler branches", () => {
        test("covers disabled detection, fetch misses, and invalid-expression replies", async () => {
            handler.enabled = false;
            expect(handler.canSed("sed/foo/bar/")).toBe(false);
            handler.enabled = true;
            expect(handler.canSed(5)).toBe(false);

            runtime.client.fetchMessages = async () => null;
            await expect(handler._fetchMatch("channel", /foo/g, "0")).resolves.toBeNull();

            const reply = vi.fn(async data => data);
            const msg = createDiscordMessage("sed/foo/bar/g /[/x", {
                channel: {
                    id: "channel-1",
                    name: "general",
                    type: 0,
                    sendTyping: async () => undefined
                },
                author: {
                    id: "user-1",
                    username: "alex"
                },
                reply
            });

            await expect(handler.execute(msg)).resolves.toBe(true);
            expect(reply.mock.calls[0][0].content).toContain("expression **2**");
        });

        test("covers non-handler errors and multi-rule replacements", async () => {
            const msg = createDiscordMessage("sed/foo/bar/", {
                channel: {
                    id: "channel-1",
                    name: "general",
                    type: 0,
                    sendTyping: async () => undefined
                },
                author: {
                    id: "user-1",
                    username: "alex"
                },
                reply: vi.fn(async data => data)
            });

            const replyWithError = vi.spyOn(handler, "replyWithError").mockResolvedValue(undefined);
            const generateSed = vi.spyOn(handler, "generateSed").mockRejectedValueOnce(new Error("boom"));

            await expect(handler.execute(msg)).resolves.toBe(true);
            expect(replyWithError).toHaveBeenCalled();

            generateSed.mockRestore();
            replyWithError.mockRestore();

            runtime.client.fetchMessages = async () => [
                { id: "1", author: { id: runtime.client.botId }, content: "skip" },
                { id: "2", author: { id: "user" }, content: "sed/foo/bar/" },
                {
                    id: "3",
                    content: "foo baz",
                    attachments: [],
                    author: {
                        id: "user",
                        displayName: "Poster",
                        displayAvatarURL: () => "https://example.com/avatar.png"
                    },
                    channel: {
                        name: "general",
                        type: 0
                    },
                    createdTimestamp: 1000
                }
            ];

            const embed = await handler.generateSed(msg, "sed/foo/bar/g /baz/qux/g");
            expect(embed.data.description).toContain("bar");
            expect(embed.data.description).toContain("qux");

            const replyMsg = createDiscordMessage("sed/foo/bar/", {
                type: MessageType.Reply,
                reference: {
                    messageId: "ref-1"
                },
                channel: {
                    id: "channel-1",
                    name: "general",
                    type: 0,
                    sendTyping: async () => undefined
                },
                author: {
                    id: "user-1",
                    username: "alex"
                },
                reply: vi.fn(async data => data)
            });

            runtime.client.fetchMessage = async () => ({
                content: "nothing here",
                attachments: [],
                author: {
                    displayName: "Poster",
                    displayAvatarURL: () => "https://example.com/avatar.png"
                },
                channel: {
                    name: "general",
                    type: 0
                },
                createdTimestamp: 1000
            });

            await expect(handler.execute(replyMsg)).resolves.toBe(true);
            expect(replyMsg.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining("No matching text found")
                })
            );
        });
    });
});
