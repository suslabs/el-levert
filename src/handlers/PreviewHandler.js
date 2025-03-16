import { ChannelType, EmbedBuilder, hyperlink } from "discord.js";

import Handler from "./Handler.js";
import HandlerError from "../errors/HandlerError.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

function logUsage(msg, str) {
    getLogger().info(
        `Generating preview for "${str.match(Util.msgUrlRegex)[0]}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)}).`
    );
}

function logCancelled(reason) {
    getLogger().info(`Generationg preview cancelled: ${reason}.`);
}

function logSending(preview) {
    const text = preview.data.description;
    getLogger().debug(`Sending preview:${Util.formatLog(text)}`);
}

function logGenTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Preview generation took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function logSendTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending preview took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

class PreviewHandler extends Handler {
    static $name = "previewHandler";

    constructor(enabaled) {
        super(enabaled, true);

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outLineLimit = Util.clamp(getClient().config.outLineLimit, 0, 2000);
    }

    canPreview(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return Util.msgUrlRegex.test(str);
    }

    removeLink(str) {
        return str.replace(Util.msgUrlRegex, "");
    }

    async genPreview(msg, str) {
        logUsage(msg, str);
        const t1 = performance.now();

        const match = Util.first(Util.findMessageUrls(str));

        if (typeof match === "undefined") {
            throw new HandlerError("Invalid input string");
        }

        const { raw: rawMsgUrl, sv_id, ch_id, msg_id } = match;

        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id: msg.author.id,
            checkAccess: true
        });

        if (!prevMsg) {
            throw new HandlerError("Preview message not found");
        }

        let content = prevMsg.content,
            split = content.split("\n");

        if (Util.overSizeLimit(content, this.outCharLimit)) {
            content = content.substring(0, this.outCharLimit) + "...";
        }

        if (split.length > this.outLineLimit) {
            content = split.slice(0, this.outLineLimit).join("\n") + "...";
        }

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

            content += "\n\n";
            content += hyperlink("[Jump to Message]", msgUrl.href);
        }

        let channel = Util.formatChannelName(prevMsg.channel);

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

            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while generating preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Preview generation failed:", err);
            return false;
        }

        await msg.channel.sendTyping();
        logSending(preview);

        try {
            const reply = await msg.reply({
                embeds: [preview]
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Reply failed:", err);
            return false;
        }

        logSendTime(t1);
        return true;
    }
}

export default PreviewHandler;
