import { EmbedBuilder, hyperlink } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

const msgUrlRegex = /https:\/\/discord.com\/channels\/(\d{18,19})\/(\d{18,19})\/(\d{18,19})/;

class PreviewHandler extends Handler {
    constructor() {
        super(true, true);

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outNewlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);
    }

    canPreview(str) {
        return msgUrlRegex.test(str);
    }

    async genPreview(msg, url) {
        const match = url.match(msgUrlRegex),
            msgUrl = match[0],
            sv_id = match[1],
            ch_id = match[2],
            msg_id = match[3];

        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, msg.author.id);

        if (!prevMsg) {
            return false;
        }

        let content = prevMsg.content,
            split = content.split("\n");

        let image;

        if (content.length > this.outCharLimit) {
            content = content.slice(0, this.outCharLimit) + "...";
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

        content += "\n\n";
        content += hyperlink("[Jump to Message]", url);

        let footer;

        if (sv_id !== msg.guild.id) {
            footer = `From #${prevMsg.channel.name} - ${prevMsg.guild.name}`;
        } else {
            footer = "From #" + prevMsg.channel.name;
        }

        const username = sedMsg.author.username,
            avatar = sedMsg.author.displayAvatarURL(),
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
                text: footer
            });

        return {
            embeds: [embed]
        };
    }

    async execute(msg) {
        if (!this.canPreview(msg.content)) {
            return false;
        }

        let preview;

        try {
            preview = await this.genPreview(msg, msg.content);
        } catch (err) {
            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while generating preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Preview gen failed", err);
            return false;
        }

        if (!preview) {
            return false;
        }

        await msg.channel.sendTyping();

        try {
            this.messageTracker.addMsg(await msg.reply(preview), msg.id);
        } catch (err) {
            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }

        return true;
    }
}

export default PreviewHandler;
