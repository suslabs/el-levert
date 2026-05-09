import { ChannelType } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import HandlerError from "../../../src/errors/HandlerError.js";
import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let PreviewHandler;
let handler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            minResponseTime: 0
        }
    });

    ({ default: PreviewHandler } = await import("../../../src/handlers/discord/PreviewHandler.js"));

    handler = new PreviewHandler(true);
    handler.load();
});

afterEach(async () => {
    handler?.unload?.();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("PreviewHandler", () => {
    test("detects previewable links and removes them from content", () => {
        const content =
            "see https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678 please";
        expect(handler.canPreview(content)).toBe(true);
        expect(handler.removeLink(content)).not.toContain(
            "https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678"
        );
    });

    test("generates embeds from fetched messages and handles execution errors", async () => {
        const attachments = [];
        attachments.first = () => ({
            contentType: "image/png",
            name: "image.png",
            url: "https://example.com/image.png"
        });

        runtime.client.fetchMessage = async () => ({
            content: "preview body",
            attachments,
            channel: {
                id: "2",
                type: ChannelType.GuildText,
                name: "general"
            },
            guild: {
                id: "1",
                name: "Guild"
            },
            author: {
                displayName: "Poster",
                displayAvatarURL: () => "https://example.com/avatar.png"
            },
            createdTimestamp: 1000
        });

        const msg = createDiscordMessage(
            "https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678",
            {
                author: {
                    id: "9",
                    username: "Caller"
                },
                channel: {
                    id: "10",
                    name: "caller",
                    type: ChannelType.GuildText,
                    send: async data => data,
                    sendTyping: async () => undefined
                }
            }
        );

        const embed = await handler.generatePreview(msg, msg.content);
        expect(embed.data.description).toContain("preview");
        expect(embed.data.description).toContain("Jump to Message");

        runtime.client.fetchMessage = async () => null;
        await expect(handler.execute(msg)).resolves.toBe(false);

        const replyWithErrorSpy = vi.spyOn(handler, "replyWithError").mockResolvedValue(undefined);
        runtime.client.fetchMessage = async () => {
            throw new Error("boom");
        };

        await expect(handler.execute(msg)).resolves.toBe(true);
        expect(replyWithErrorSpy).toHaveBeenCalledWith(msg, expect.any(Error), "preview", "generating preview");
    });
});

describe("Merged Branch Coverage", () => {
    let runtime;
    let PreviewHandler;
    let handler;

    beforeEach(async () => {
        runtime = await createRuntime({
            loadManagers: false,
            loadVMs: false,
            config: {
                minResponseTime: 0
            }
        });

        ({ default: PreviewHandler } = await import("../../../src/handlers/discord/PreviewHandler.js"));

        handler = new PreviewHandler(true);
        handler.load();
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        handler?.unload?.();
        await cleanupRuntime(runtime);
        runtime = null;
    });

    describe("PreviewHandler branch coverage", () => {
        test("handles disabled or invalid preview inputs and DM attachment-only previews", async () => {
            expect(handler.canPreview(123)).toBe(false);
            handler.enabled = false;
            expect(handler.canPreview("https://discord.com/channels/1/2/3")).toBe(false);
            handler.enabled = true;

            const msg = createDiscordMessage("hello");
            await expect(handler.generatePreview(msg, "hello")).rejects.toThrow("Invalid input string");

            const attachments = [
                {
                    contentType: "video/mp4",
                    name: "clip.mp4",
                    url: "https://example.com/clip.mp4"
                }
            ];
            attachments.first = () => attachments[0];

            runtime.client.fetchMessage = async () => ({
                content: "",
                attachments,
                channel: {
                    id: "2",
                    type: ChannelType.DM,
                    name: "dm"
                },
                author: {
                    displayName: "Poster",
                    displayAvatarURL: () => "https://example.com/avatar.png"
                },
                createdTimestamp: 1000
            });

            const previewMsg = createDiscordMessage("https://discord.com/channels/@me/123456789012345678/123456789012345678", {
                author: {
                    id: "9",
                    username: "Caller"
                }
            });

            const embed = await handler.generatePreview(previewMsg, previewMsg.content);
            expect(embed.data.description).toContain("Video");
            expect(embed.data.description).not.toContain("Jump to Message");
        });

        test("replies with warning messages for handled preview errors", async () => {
            const msg = createDiscordMessage("https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678");

            vi.spyOn(handler, "generatePreview").mockRejectedValue(new HandlerError("Preview access denied"));

            const replySpy = vi.spyOn(handler, "reply").mockResolvedValue(undefined);

            await expect(handler.execute(msg)).resolves.toBe(true);
            expect(replySpy).toHaveBeenCalledWith(msg, ":warning: Preview access denied.");
        });
    });
});
