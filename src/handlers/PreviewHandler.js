import { ChannelType, EmbedBuilder, hyperlink } from "discord.js";

import Handler from "./Handler.js";
import HandlerError from "../errors/HandlerError.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

const msgUrlRegex =
    /(?:(https?):\/\/)?(?:(www|ptb)\.)?discord\.com\/channels\/(?<sv_id>\d{18,19}|@me)\/(?<ch_id>\d{18,19})(?:\/(?<msg_id>\d{18,19}))/;

function logUsage(msg, str) {
    getLogger().info(
        `Generating preview for "${str.match(msgUrlRegex)[0]}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${msg.channel.name}).`
    );
}

function logSending(preview) {
    getLogger().debug(`Sending preview:${Util.formatLog(preview)}`);
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
        this.outNewlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);
    }

    canPreview(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return msgUrlRegex.test(str);
    }

    removeLink(str) {
        return str.replace(msgUrlRegex, "");
    }

    async genPreview(msg, str) {
        logUsage(msg, str);

        const t1 = performance.now(),
            match = str.match(msgUrlRegex);

        if (!match) {
            throw new HandlerError("Invalid input string");
        }

        const rawMsgUrl = match[0],
            { sv_id, ch_id, msg_id } = match.groups;

        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, {
            user_id: msg.author.id,
            checkAccess: true
        });

        if (!prevMsg) {
            throw new HandlerError("Preview message not found");
        }

        let content = prevMsg.content,
            image,
            split = content.split("\n");

        if (content.length > this.outCharLimit) {
            content = content.substring(0, this.outCharLimit) + "...";
        }

        if (split.length > this.outNewlineLimit) {
            content = split.slice(0, this.outNewlineLimit).join("\n") + "...";
        }

        if (prevMsg.attachments.size > 0) {
            const attach = prevMsg.attachments.first(),
                isImage = attach.contentType.startsWith("image/");

            if (isImage) {
                image = attach.url;
            }

            if (content.length < 1) {
                if (isImage) {
                    content = hyperlink(`[Image (${attach.name})]`, attach.url);
                } else {
                    content = hyperlink(`[Attachment (${attach.name})]`, attach.url);
                }
            }
        }

        const inDms = prevMsg.channel.type === ChannelType.DM,
            inThread = [ChannelType.PublicThread, ChannelType.PrivateThread].includes(prevMsg.channel.type);

        if (!inDms) {
            const msgUrl = new URL(rawMsgUrl);
            msgUrl.protocol = "https";
            msgUrl.hostname = "discord.com";

            content += "\n\n";
            content += hyperlink("[Jump to Message]", msgUrl.href);
        }

        let channel;

        if (inDms) {
            channel = "DMs";
        } else {
            channel = `#${inThread ? prevMsg.channel.parent.name : prevMsg.channel.name}`;

            if (typeof msg.guild !== "undefined" && sv_id !== msg.guild.id) {
                channel += ` - ${prevMsg.guild.name}`;
            }

            if (inThread) {
                channel = `"${prevMsg.channel.name}" (thread of parent channel ${channel})`;
            }
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

        let t1 = performance.now(),
            preview;

        try {
            preview = await this.genPreview(msg, msg.content);
        } catch (err) {
            if (err.name === "HandlerError") {
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
