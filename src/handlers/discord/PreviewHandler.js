import { ChannelType, EmbedBuilder, hyperlink } from "discord.js";

import MessageHandler from "./MessageHandler.js";
import MessageLimitTypes from "./MessageLimitTypes.js";

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

function logGenerateCancelled(reason) {
    getLogger().info(`Generating preview cancelled: ${reason}.`);
}

function logPreviewSending(preview) {
    if (getLogger().isDebugEnabled()) {
        const text = DiscordUtil.getEmbedData(preview).description;
        getLogger().debug(`Sending preview:${LoggerUtil.formatLog(text)}`);
    }
}

function logGenerateTime(t1) {
    if (getLogger().isDebugEnabled()) {
        const t2 = performance.now(),
            elapsed = Util.timeDelta(t2, t1);

        getLogger().debug(`Preview generation took ${Util.formatNumber(elapsed)} ms.`);
    }
}

function logSendTime(t1) {
    const t2 = performance.now(),
        elapsed = Util.timeDelta(t2, t1);

    getLogger().info(`Sending preview took ${Util.formatNumber(elapsed)} ms.`);
}

class PreviewHandler extends MessageHandler {
    static $name = "previewHandler";

    constructor(enabaled) {
        super(enabaled, true, false, {
            minResponseTime: getClient().config.minResponseTime + 0.5 / Util.durationSeconds.milli
        });
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

    async generatePreview(msg, str) {
        logUsage(msg, str);
        const t1 = performance.now();

        const match = Util.first(DiscordUtil.findMessageUrls(str));

        if (typeof match === "undefined") {
            throw new HandlerError("Invalid input string", str);
        }

        const { sv_id, ch_id, msg_id } = match;

        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id: msg.author.id,
            checkAccess: true
        });

        if (prevMsg === null) {
            throw new HandlerError("Preview message not found", { sv_id, ch_id, msg_id });
        }

        let content = prevMsg.content,
            image;

        content = Util.trimString(content, ...this.getLimits(true, true).outTrim);

        if (!Util.empty(prevMsg.attachments)) {
            let attach = prevMsg.attachments.first(),
                attachType = "";

            switch (Util.splitAt(attach.contentType, "/")[0]) {
                case "image":
                    attachType = "Image";
                    image = attach.url;
                    break;
                case "video":
                    attachType = "Video";
                    break;
                default:
                    attachType = "Attachment";
                    break;
            }

            if (Util.empty(content)) {
                const prefix = Util.empty(attachType) ? "" : attachType + " ";
                content = hyperlink(`[${prefix}(${attach.name})]`, attach.url);
            }
        }

        if (prevMsg.channel.type !== ChannelType.DM) {
            const msgUrl = DiscordUtil.getMessageUrl(sv_id, ch_id, msg_id);
            content += "\n\n" + hyperlink("[Jump to Message]", msgUrl);
        }

        let channel = DiscordUtil.formatChannelName(prevMsg.channel);

        if (typeof prevMsg.guild !== "undefined" && prevMsg.guild.id !== sv_id) {
            channel += ` in ${prevMsg.guild.name}`;
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

        logGenerateTime(t1);
        return embed;
    }

    async execute(msg) {
        if (!this.canPreview(msg.content)) {
            return false;
        }

        let preview = null;
        const t1 = performance.now();

        try {
            preview = await this.generatePreview(msg, msg.content);
        } catch (err) {
            if (err.name !== "HandlerError") {
                await this.replyWithError(msg, err, "preview", "generating preview");
                return true;
            }

            logGenerateCancelled(err.message);
            return false;
        }

        logPreviewSending(preview);

        this._sendTyping(msg);
        await this._addDelay(0);

        await this.reply(
            msg,
            {
                embeds: [preview]
            },
            {
                limitType: MessageLimitTypes.none
            }
        )
            .then(() => logSendTime(t1))
            .catch(() => {});

        return true;
    }
}

export default PreviewHandler;
