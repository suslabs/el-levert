import { EmbedBuilder, MessageType } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

async function fetchMatch(ch_id, regex, ignore_id, limit = 100) {
    const msgs = await getClient().fetchMessages(
        ch_id,
        {
            limit: limit
        },
        null,
        false
    );

    if (!msgs) {
        return false;
    }

    const msg = msgs.find(x => regex.test(x) && x.id !== ignore_id);
    return typeof msg === "undefined" ? false : msg;
}

const sedRegex = /^sed\/(.+?)\/([^/]*)\/?(.{1,2})?/;

class SedHandler extends Handler {
    constructor() {
        super(getClient().config.enableSed, true);

        this.regex = sedRegex;
    }

    canSed(str) {
        return this.regex.test(str);
    }

    async genSed(msg) {
        const match = msg.content.match(this.regex),
            parsedRegex = match[1],
            replace = match[2],
            flag = match[3];

        if (match.length < 3) {
            return [undefined, ":warning: Encountered invalid args."];
        }

        let regex, sedMsg;

        try {
            regex = new RegExp(parsedRegex, flag ?? "" + "i");
        } catch (err) {
            return [undefined, ":warning: Invalid regex or flags."];
        }

        if (msg.type === MessageType.Reply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId, null, false);
        } else {
            sedMsg = await fetchMatch(msg.channel.id, regex, msg.id);
        }

        if (!sedMsg) {
            return [undefined, ":warning: No matching message found."];
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: sedMsg.author.username,
                iconURL: sedMsg.author.displayAvatarURL()
            })
            .setDescription(sedMsg.content.replace(regex, replace ?? ""))
            .setTimestamp(sedMsg.editedTimestamp ?? sedMsg.createdTimestamp)
            .setFooter({
                text: "From #" + sedMsg.channel.name
            });

        return [embed, undefined];
    }

    async execute(msg) {
        if (!this.canSed(msg.content)) {
            return false;
        }

        await msg.channel.sendTyping();
        const ret = await this.genSed(msg);

        if (typeof ret[1] !== "undefined") {
            const reply = msg.reply(ret[1]);
            this.messageTracker.addMsg(reply, msg.id);
        }

        const embed = ret[0];

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
    }
}

export default SedHandler;
