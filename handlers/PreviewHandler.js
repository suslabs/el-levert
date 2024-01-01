import { EmbedBuilder } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

class PreviewHandler extends Handler {
    constructor() {
        super();

        this.regex = /https:\/\/discord.com\/channels\/(\d{18,19})\/(\d{18,19})\/(\d{18,19})/;
    }

    canPreview(str) {
        return this.regex.test(str);
    }

    async genPreview(msg) {
        const match = msg.content.match(this.regex),
              url = match[0];

        const sv_id = match[1],
              ch_id = match[2],
              msg_id = match[3];
        
        const prevMsg = await getClient().fetchMessage(ch_id, msg_id, msg.author.id);

        if(!prevMsg) {
            return false;
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: prevMsg.author.username,
                iconURL: Util.getIcon(prevMsg.author)
            })
            .setTimestamp(prevMsg.editedTimestamp ?? prevMsg.createdTimestamp);
        
        if(sv_id !== msg.guild.id) {
            embed.setFooter({
                text: `From #${prevMsg.channel.name} - ${prevMsg.guild.name}`
            });
        } else {
            embed.setFooter({
                text: "From #" + prevMsg.channel.name
            });
        }

        let content = prevMsg.content,
            split = content.split("\n");

        if(content.length > 500) {
            content = content.slice(0, 500) + "...";
        }

        if(split.length > 10) {
            content = split.slice(0, 10).join("\n") + "...";
        }
        
        if(prevMsg.attachments.size > 0) {
            const attach = prevMsg.attachments.first();

            if(attach.contentType.startsWith("image/")) {
                embed.setImage(attach.url);

                if(content.length < 1) {
                    content = `[[Image (${attach.name})]](${attach.url})`;
                }
            }
        }

        embed.setDescription(`${content}\n\n[[Jump to Message]](${url})`);

        return {
            embeds: [
                embed
            ]
        };
    }

    async execute(msg) {
        if(!this.canPreview(msg.content)) {
            return false;
        }

        let preview;
        
        try {
            preview = await this.genPreview(msg);
        } catch(err) {
            this.addMsg(await msg.reply({
                content: ":no_entry_sign: Encountered exception while generating preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            }), msg.id);

            getLogger().error("Preview gen failed", err);
            return false;
        }

        if(!preview) {
            return false;
        }

        await msg.channel.sendTyping();

        try {
            this.addMsg(await msg.reply(preview), msg.id);
        } catch(err) {
            this.addMsg(await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending preview:",
                ...Util.getFileAttach(err.stack, "error.js")
            }), msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }

        return true;
    }
}

export default PreviewHandler;