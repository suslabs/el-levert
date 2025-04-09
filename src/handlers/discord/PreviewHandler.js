import { ChannelType, EmbedBuilder, hyperlink } from "discord.js";

import MessageHandler from "../MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import HandlerError from "../../errors/HandlerError.js";

function logUsage(msg, str) {
    getLogger().info(
        `Generating preview for "${str.match(DiscordUtil.msgUrlRegex)[0]}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logCancelled(reason) {
    getLogger().info(`Generating preview cancelled: ${reason}.`);
}

function logSending(preview) {
    const text = preview.data.description;
    getLogger().debug(`Sending preview:${LoggerUtil.formatLog(text)}`);
}

function logGenTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Preview generation took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

function logSendTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending preview took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

class PreviewHandler extends MessageHandler {
    static $name = "previewHandler";

    constructor(enabaled) {
        super(enabaled, true);

        this.outCharLimit = getClient().config.outCharLimit;
        this.outLineLimit = getClient().config.outLineLimit;
    }

    canPreview(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return DiscordUtil.msgUrlRegex.test(str);
    }

    removeLink(str) {
        return str.replace(DiscordUtil.msgUrlRegex, "");
    }

    async genPreview(msg, str) {
        logUsage(msg, str);
        const t1 = performance.now();

        const match = Util.first(DiscordUtil.findMessageUrls(str));

        if (typeof match === "undefined") {
            throw new HandlerError("Invalid input string");
        }

        const { raw: rawMsgUrl, sv_id, ch_id, msg_id } = match;

        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id: msg.author.id,
            checkAccess: true
        });

        if (prevMsg === null) {
            throw new HandlerError("Preview message not found");
        }

        let content = prevMsg.content;
        content = Util.trimString(content, this.outCharLimit, this.outLineLimit);

        let image;

        if (!Util.empty(prevMsg.attachments)) {
            const attach = prevMsg.attachments.first(),
                isImage = attach.contentType.startsWith("image/");

            if (isImage) {
                image = attach.url;
            }

            if (Util.empty(content)) {
                if (isImage) {
                    content = hyperlink(`[Image (${attach.name})]`, attach.url);
                } else {
                    content = hyperlink(`[Attachment (${attach.name})]`, attach.url);
                }
            }
        }

        if (prevMsg.channel.type !== ChannelType.DM) {
            const msgUrl = new URL(rawMsgUrl);
            msgUrl.protocol = "https";
            msgUrl.hostname = "discord.com";

            content += "\n\n" + hyperlink("[Jump to Message]", msgUrl.href);
        }

        let channel = DiscordUtil.formatChannelName(prevMsg.channel);

        if (prevMsg.guild && sv_id !== prevMsg.guild.id) {
            channel += ` - ${prevMsg.guild.name}`;
        }

        const username = prevMsg.author.displayName,
            avatar = prevMsg.author.displayAvatarURL(),
            timestamp = prevMsg.editedTimestamp ?? prevMsg.createdTimestamp;

        const embed = new EmbedBuilder()
            .setAuthor({
                name: username,
                iconURL: avatar
            })
            .setDescription(content)
            .setTimestamp(timestamp)
            .setImage(image)
            .setFooter({
                text: `From ${channel}`
            });

        logGenTime(t1);
        return embed;
    }

    async execute(msg) {
        if (!this.canPreview(msg.content)) {
            return false;
        }

        const t1 = performance.now();

        let preview;

        try {
            preview = await this.genPreview(msg, msg.content);
        } catch (err) {
            if (err.name === "HandlerError") {
                logCancelled(err.message);
                return false;
            }

            await this.reply(msg, {
                content: ":no_entry_sign: Encountered exception while generating preview:",
                ...DiscordUtil.getFileAttach(err.stack, "error.js")
            });

            getLogger().error("Preview generation failed:", err);
            return false;
        }

        await msg.channel.sendTyping();
        logSending(preview);

        try {
            await this.reply(msg, {
                embeds: [preview]
            });
        } catch (err) {
            await this.reply(msg, {
                content: ":no_entry_sign: Encountered exception while sending preview:",
                ...DiscordUtil.getFileAttach(err.stack, "error.js")
            });

            getLogger().error("Reply failed:", err);
            return false;
        }

        logSendTime(t1);
        return true;
    }
}

export default PreviewHandler;
