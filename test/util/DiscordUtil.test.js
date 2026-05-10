import { afterEach, describe, expect, test } from "vitest";
import { ChannelType } from "discord.js";

import DiscordUtil from "../../src/util/DiscordUtil.js";
import createHttpStubServer from "../helpers/httpStubServer.js";

let server;

afterEach(async () => {
    await server?.close?.();
    server = null;
});

describe("DiscordUtil", () => {
    test("finds user ids, codeblocks, and parses message or attachment urls", () => {
        expect(DiscordUtil.findUserIds("123456789012345678 and 987654321098765432")).toEqual([
            "123456789012345678",
            "987654321098765432"
        ]);

        expect(DiscordUtil.findCodeblocks("```js\nx\n``` and `y`")).toHaveLength(2);
        expect(DiscordUtil.findCodeblocks("`x` `y`")).toHaveLength(2);
        expect(DiscordUtil.maskCodeblocks("rabbit `leveret` bunny")).toBe("rabbit" + " ".repeat(11) + "bunny");

        expect(
            DiscordUtil.parseMessageUrl(
                "https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678"
            )
        ).toEqual(
            expect.objectContaining({
                sv_id: "123456789012345678",
                ch_id: "123456789012345678",
                msg_id: "123456789012345678"
            })
        );

        expect(
            DiscordUtil.findMessageUrls(
                "https://discord.com/channels/123456789012345678/123456789012345678/123456789012345678"
            )
        ).toHaveLength(1);

        expect(
            DiscordUtil.findAttachmentUrls("https://cdn.discordapp.com/attachments/1/2/file.txt?ex=aa&is=bb&hm=cc")[0]
        ).toEqual(
            expect.objectContaining({
                serverId: "1",
                channelId: "2",
                file: "file.txt"
            })
        );
    });

    test("finds normal and legacy user mentions", () => {
        expect(DiscordUtil.findMentions("<@123456789012345678> <@!987654321098765432>")).toEqual([
            "123456789012345678",
            "987654321098765432"
        ]);
    });

    test("invalid attachment URLs parse to null", () => {
        expect(DiscordUtil.parseAttachmentUrl("not a discord attachment")).toBeNull();
    });

    test("markdown trimming closes delimiters opened after the first character", () => {
        expect(DiscordUtil.markdownTrimString("x **abcdef**", 4, 1)).toMatch(/\*\*$/);
    });

    test("formats channel names and stringifies, sizes, and trims embeds", () => {
        expect(DiscordUtil.formatChannelName({ type: ChannelType.DM }, null)).toBe("DMs");
        expect(
            DiscordUtil.formatChannelName(
                {
                    type: ChannelType.PublicThread,
                    name: "thread",
                    parent: { name: "parent" },
                    guild: { id: "2", name: "Other" }
                },
                { id: "1" }
            )
        ).toContain("thread");

        const embed = {
            author: {
                name: "Author",
                icon_url: "https://example.com/icon.png"
            },
            title: "Title",
            url: "https://example.com",
            description: "Line 1\nLine 2",
            thumbnail: {
                url: "https://example.com/thumb.png"
            },
            image: {
                url: "https://example.com/image.png"
            },
            fields: [{ name: "Field", value: "Value", inline: true }],
            footer: {
                text: "Footer",
                icon_url: "https://example.com/footer.png"
            },
            timestamp: new Date(0).toISOString()
        };

        const built = DiscordUtil.getBuiltEmbed(embed);
        const countOptions = {
            count: "chars",
            areas: ["content", "details", "fields"],
            urls: true
        };
        expect(built).toEqual(expect.any(Object));
        expect(DiscordUtil.stringifyEmbed(built, { headers: true, urls: true })).toContain("[Title]");
        expect(DiscordUtil.stringifyEmbed(built, 5)).toContain("Title");
        expect(DiscordUtil.getEmbedSize(built, countOptions)).toBeGreaterThan(0);
        expect(DiscordUtil.getEmbedSize(built, 5)).toBeGreaterThan(0);
        expect(DiscordUtil.overSizeLimits(built, 1, undefined, countOptions)).toEqual([expect.any(Number), null]);
        expect(
            DiscordUtil.overSizeLimits(built, undefined, 1, {
                ...countOptions,
                count: "lines"
            })
        ).toEqual([null, expect.any(Number)]);
        expect(DiscordUtil.overSizeLimits(built, 1, undefined, 5)).toEqual([expect.any(Number), null]);

        const trimmed = DiscordUtil.trimEmbed(built, 4, 1, { oversized: true });
        expect(trimmed.description.length).toBeGreaterThan(0);
        expect(() => DiscordUtil.trimEmbed(built, 4, 1, 5)).not.toThrow();
    });

    test("fetches attachments with extension or content-type validation and rebinds messages", async () => {
        server = await createHttpStubServer({
            "/file.txt": () => ({
                headers: {
                    "content-type": "text/plain"
                },
                body: "body"
            })
        });

        const message = {
            fileUrl: `${server.url}/file.txt`,
            attachInfo: { ext: ".txt" }
        };

        const { body } = await DiscordUtil.fetchAttachment(message, "text", {
            allowedContentTypes: [],
            allowedContentType: [],
            maxSize: 100
        });
        expect(typeof body).toBe("string");

        await expect(
            DiscordUtil.fetchAttachment(
                {
                    fileUrl: `${server.url}/file.bin`,
                    attachInfo: { ext: ".bin" }
                },
                "text",
                { allowedContentTypes: [".txt"] }
            )
        ).rejects.toThrow("Invalid file extension");

        const msg = { channel: { id: "123" } };
        DiscordUtil.rebindMessage(msg, {
            channels: {
                cache: new Map([["123", { id: "123", name: "general" }]])
            }
        });
        expect(msg.channel.name).toBe("general");
    });
});
