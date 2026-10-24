import { afterEach, describe, expect, test } from "vitest";
import { ChannelType, EmbedBuilder, AttachmentBuilder } from "discord.js";

import DiscordUtil from "../../src/util/DiscordUtil.js";
import createHttpStubServer from "../helpers/httpStubServer.js";

import UtilError from "../../src/errors/UtilError.js";

let server;

afterEach(async () => {
    await server?.close();
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

    test("identifies and parses attachment URLs", () => {
        const url = "https://cdn.discordapp.com/attachments/123456789/987654321/image.png?ex=6500&is=6400&hm=abcd";
        const bareUrl = "https://cdn.discordapp.com/attachments/123456789/987654321/image.png";

        expect(DiscordUtil.isAttachmentUrl(url)).toBe(true);
        expect(DiscordUtil.isAttachmentUrl(bareUrl)).toBe(true);
        expect(DiscordUtil.isAttachmentUrl("not a discord attachment")).toBe(false);
        expect(DiscordUtil.isAttachmentUrl("")).toBe(false);
        expect(DiscordUtil.isAttachmentUrl(null)).toBe(false);

        expect(DiscordUtil.hasAttachmentUrls(`Here is a file: ${bareUrl} check it out`)).toBe(true);
        expect(DiscordUtil.hasAttachmentUrls("no attachments here")).toBe(false);
        expect(DiscordUtil.hasAttachmentUrls("")).toBe(false);
        expect(DiscordUtil.hasAttachmentUrls(null)).toBe(false);

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
        expect(DiscordUtil.embedOverSizeLimit(built, 1, undefined, countOptions)).toEqual([expect.any(Number), null]);
        expect(
            DiscordUtil.embedOverSizeLimit(built, undefined, 1, {
                ...countOptions,
                count: "lines"
            })
        ).toEqual([null, expect.any(Number)]);
        expect(DiscordUtil.embedOverSizeLimit(built, 1, undefined, 5)).toEqual([expect.any(Number), null]);

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

    test("formats users across diverse inputs, formats, and options", () => {
        expect(DiscordUtil.formatUser("alex", "12345", true)).toBe("alex (`12345`)");
        expect(DiscordUtil.formatUser("alex", "12345", false)).toBe("alex (12345)");
        expect(DiscordUtil.formatUser({ id: "12345", username: "alex" }, null, true)).toBe("alex (`12345`)");
        expect(DiscordUtil.formatUser("12345", null, true)).toBe("`12345`");
        expect(DiscordUtil.formatUser("12345", null, false)).toBe("12345");
        expect(DiscordUtil.formatUser("0")).toBe("invalid");
        expect(DiscordUtil.formatUser(null)).toBe("invalid");
        expect(DiscordUtil.formatUser("alex", "12345", true, { possessive: true })).toBe("alex's (`12345`)");
        expect(DiscordUtil.formatUser("12345", null, true, { possessive: true })).toBe("`12345`'s");
        expect(
            DiscordUtil.formatUser({ user: { id: "12345", username: "alex" }, nickname: "ally" }, null, true, {
                format: "owner"
            })
        ).toBe("`alex` (also known as **ally**)");
        expect(DiscordUtil.formatUser({ id: "12345", username: "alex" }, null, true, { format: "owner" })).toBe(
            "`alex`"
        );
        expect(
            DiscordUtil.formatUser({ id: "12345", username: "alex", nickname: "ally" }, null, false, {
                format: "owner"
            })
        ).toBe("alex (also known as ally)");
        expect(DiscordUtil.formatUser("12345", null, true, { format: "owner" })).toBe("`12345`");
        expect(DiscordUtil.formatUser("alex", "12345", true, { format: "default" })).toBe("alex (`12345`)");
        expect(() => DiscordUtil.formatUser("alex", "12345", true, { format: "invalid" })).toThrow(
            "Invalid user format: invalid"
        );
        expect(() => DiscordUtil.formatUser("alex", "12345", true, { format: "invalid" })).toThrow(UtilError);
    });

    test("formats error embed and overflows to file attachment when exceeding char limit", () => {
        const shortRes = DiscordUtil.formatErrorEmbed("Header:", new Error("short error"), {
            charLimit: 1000
        });
        expect(shortRes.content).toBe("Header:");
        expect(shortRes.embeds).toHaveLength(1);
        expect(shortRes.embeds[0].data.description).toContain("```js\nError: short error");
        expect(shortRes.files).toBeUndefined();

        const customRes = DiscordUtil.formatErrorEmbed("Header:", new Error("py error"), {
            lang: "py"
        });
        expect(customRes.embeds[0].data.description).toContain("```py\nError: py error");

        const longError = "a".repeat(1500);
        const longRes = DiscordUtil.formatErrorEmbed("Header:", longError, {
            filename: "custom_error.txt",
            charLimit: 1000
        });
        expect(longRes.content).toBe("Header:");
        expect(longRes.embeds).toBeUndefined();
        expect(longRes.files).toHaveLength(1);
        expect(longRes.files[0].name).toBe("custom_error.txt");
    });

    test("formats message logs with smart attachments and data serialization", () => {
        expect(DiscordUtil.formatMessageLog(null)).toBe(" none");
        expect(DiscordUtil.formatMessageLog("simple reply")).toBe(' "simple reply"');
        expect(DiscordUtil.formatMessageLog(["wrapped reply"])).toBe(' "wrapped reply"');

        const textContent = "Hello world\nSecond line",
            textAttach = new AttachmentBuilder(Buffer.from(textContent), {
                name: "sample.txt"
            });
        const textLog = DiscordUtil.formatMessageLog({ files: [textAttach] });
        expect(textLog).toContain("sample.txt");
        expect(textLog).toContain('"size":23');
        expect(textLog).toContain("Hello world\\nSecond line");
        expect(textLog).not.toContain('"preview"');

        const binaryAttach = new AttachmentBuilder(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]), {
            name: "image.png"
        });
        const binaryLog = DiscordUtil.formatMessageLog({ files: [binaryAttach] });
        expect(binaryLog).toContain("image.png");
        expect(binaryLog).toContain('"size":6');
        expect(binaryLog).toContain("89504e470001");
        expect(binaryLog).not.toContain('"preview"');

        const longText = "a".repeat(2500);
        const longTextAttach = new AttachmentBuilder(Buffer.from(longText), {
            name: "long.txt"
        });
        const longLog = DiscordUtil.formatMessageLog({ files: [longTextAttach] });
        expect(longLog).toContain('"size":2500');
        expect(longLog).toContain("more character");

        const longBytes = Buffer.alloc(300, 0xab);
        const longBinaryAttach = new AttachmentBuilder(longBytes, {
            name: "data.bin"
        });
        const longBinaryLog = DiscordUtil.formatMessageLog({ files: [longBinaryAttach] });
        expect(longBinaryLog).toContain('"size":300');
        expect(longBinaryLog).toContain("...");

        const embed = new EmbedBuilder().setDescription("test description");
        const embedLog = DiscordUtil.formatMessageLog(embed);
        expect(embedLog).toContain("test description");
    });
});
