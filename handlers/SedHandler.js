import { EmbedBuilder, MessageType } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

async function fetchMatch(ch_id, regex, ignore_id, limit = 100) {
    const msgs = await getClient().fetchMessages(ch_id, {
        limit: limit
    }, null, false);

    if(!msgs) {
        return false;
    }
    
    const msg = msgs.find(x => regex.test(x) &&
                     x.id !== ignore_id);

    return typeof msg === "undefined" ? false : msg;
}

class SedHandler extends Handler {
    constructor() {
        super(getClient().config.enableSed || true);

        this.regex = /^sed\/(.+?)\/([^/]*)\/?(.{1,2})?/;
    }

    canSed(str) {
        return this.enabled && this.regex.test(str);
    }

    async execute(msg) {
        if(!this.canSed(msg.content)) {
            return;
        }

        await msg.channel.sendTyping();

        const match = msg.content.match(this.regex),
              sedRegex = match[1],
              replace = match[2],
              flag = match[3];

        if(match.length < 3) {
            this.addReply(await msg.reply(":warning: Encountered invalid args."));
            return;
        }

        let regex, sedMsg;

        try {
            regex = new RegExp(sedRegex, flag || "" + "i");
        } catch(err) {
            this.addReply(await msg.reply(":warning: Invalid regex or flags."));
            return;
        }

        if(msg.type === MessageType.Reply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId, null, false);
        } else {
            sedMsg = await fetchMatch(msg.channel.id, regex, msg.id);
        }

        if(!sedMsg) {
            this.addReply(await msg.reply(":warning: No matching message found."));
            return;
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: sedMsg.author.username,
                iconURL: Util.getIcon(sedMsg.author)
            })
            .setDescription(sedMsg.content.replace(regex, replace || ""))
            .setTimestamp()
            .setFooter({
                text: "From #" + sedMsg.channel.name
            });
        
        try {
            this.addReply(await msg.reply({
                embeds: [
                    embed
                ]
            }));
        } catch(err) {
            this.addReply(await msg.reply({
                content: `:no_entry_sign: Encountered exception while sending preview:`,
                ...Util.getFileAttach(err.stack, "error.js")
            }));
    
            getLogger().error("Reply failed", err);
            return false;
        }
    }
}

export default SedHandler;