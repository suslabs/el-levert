import { EmbedBuilder, MessageType } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

const sedRegex = /^sed\/(.+?)\/([^/]*)\/?(.{1,2})?/,
    sedUsage = "Usage: sed/regex/replace/flags (optional)";

class SedHandler extends Handler {
    constructor() {
        super(getClient().config.enableSed, true);
    }

    canSed(str) {
        return sedRegex.test(str);
    }

    async fetchMatch(ch_id, regex, ignore_id, limit = 100) {
        const msgs = await getClient().fetchMessages(ch_id, { limit }, null, false);

        if (!msgs) {
            return false;
        }

        const msg = msgs.find(msg => {
            if (msg.author.id === getClient().client.user.id || msg.id === ignore_id) {
                return false;
            }

            return regex.test(msg);
        });

        if (typeof msg === "undefined") {
            return false;
        }

        return msg;
    }

    async genSed(msg) {
        const match = msg.content.match(sedRegex),
            parsedRegex = match[1],
            replace = match[2],
            flag = match[3] ?? "" + "i";

        if (match.length < 3) {
            return [undefined, ":warning: Invalid regex args.\n" + sedUsage];
        }

        let regex, sedMsg;

        try {
            regex = new RegExp(parsedRegex, flag);
        } catch (err) {
            return [undefined, ":warning: Invalid regex or flags.\n" + sedUsage];
        }

        if (msg.type === MessageType.Reply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId, null, false);
        } else {
            sedMsg = await this.fetchMatch(msg.channel.id, regex, msg.id);
        }

        if (!sedMsg) {
            return [undefined, ":warning: No matching message found."];
        }

        const username = sedMsg.author.displayName,
            avatar = sedMsg.author.displayAvatarURL(),
            content = sedMsg.content.replace(regex, replace ?? ""),
            channel = `#${sedMsg.channel.name}`,
            timestamp = sedMsg.editedTimestamp ?? sedMsg.createdTimestamp,
            image = sedMsg.attachments.at(0)?.url;

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

        return [embed, undefined];
    }

    async execute(msg) {
        if (!this.canSed(msg.content)) {
            return false;
        }

        await msg.channel.sendTyping();

        const ret = await this.genSed(msg),
            embed = ret[0],
            err = ret[1];

        if (typeof err !== "undefined") {
            const reply = msg.reply(err);
            this.messageTracker.addMsg(reply, msg.id);
        }

        try {
            const reply = await msg.reply({
                embeds: [embed]
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            const reply = await msg.reply({
                content: `:no_entry_sign: Encountered exception while sending preview:`,
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }

        return true;
    }
}

export default SedHandler;
