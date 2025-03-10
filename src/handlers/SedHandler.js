import { ChannelType, MessageType, EmbedBuilder } from "discord.js";

import Handler from "./Handler.js";
import HandlerError from "../errors/HandlerError.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

const sedRegex = /^sed\/(?<regex_str>.+?)\/(?<replace>[^/]*)\/?(?<flags_str>.{1,2})?/,
    sedUsage = "Usage: sed/regex/replace/flags (optional)";

function logUsage(msg) {
    getLogger().info(
        `Generating sed for "${msg.content}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)}).`
    );
}

function logSending(sed) {
    const text = sed.data.description;
    getLogger().debug(`Sending replaced message:${Util.formatLog(text)}`);
}

function logGenTime(t1) {
    const t2 = performance.now();
    getLogger().debug(`Sed generation took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function logSendTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending replaced message took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

class SedHandler extends Handler {
    static $name = "sedHandler";

    constructor(enabled) {
        super(enabled, true);
    }

    async execute(msg) {
        if (!this._canSed(msg.content)) {
            return false;
        }

        let t1 = performance.now(),
            sed;

        await msg.channel.sendTyping();

        try {
            sed = await this._genSed(msg, msg.content);
        } catch (err) {
            if (err.name === "HandlerError") {
                let emoji;

                switch (err.message) {
                    case "No matching message found":
                        emoji = ":no_entry_sign:";
                        break;
                    default:
                        emoji = ":warning:";
                }

                const reply = msg.reply(`${emoji} ${err.message}.\n${sedUsage}`);
                this.messageTracker.addMsg(reply, msg.id);

                return true;
            }

            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while generating sed replace:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Sed generation failed:", err);
            return false;
        }

        logSending(sed);

        try {
            const reply = await msg.reply({
                embeds: [sed]
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            const reply = await msg.reply({
                content: `:no_entry_sign: Encountered exception while sending sed replace:`,
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }

        logSendTime(t1);
        return true;
    }

    _canSed(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return sedRegex.test(str);
    }

    async _fetchMatch(ch_id, regex, ignore_id, limit = 100) {
        const msgs = await getClient().fetchMessages(ch_id, { limit });

        if (!msgs) {
            return false;
        }

        const msg = msgs.find(msg => {
            const isBot = msg.author.id === getClient().client.user.id;

            if (isBot || msg.id === ignore_id) {
                return false;
            }

            return regex.test(msg);
        });

        if (typeof msg === "undefined") {
            return false;
        }

        return msg;
    }

    async _genSed(msg, str) {
        logUsage(msg);

        const t1 = performance.now(),
            match = str.match(sedRegex);

        if (!match) {
            throw new HandlerError("Invalid input string");
        }

        const { regex_str, replace, flags_str } = match.groups,
            flags = flags_str ?? "" + "i";

        if (match.length < 3) {
            throw new HandlerError("Invalid regex args");
        }

        let regex, sedMsg;

        try {
            regex = new RegExp(regex_str, flags);
        } catch (err) {
            throw new HandlerError("Invalid regex or flags");
        }

        switch (msg.type) {
            case MessageType.Reply:
                sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId);
                break;
            default:
                sedMsg = await this._fetchMatch(msg.channel.id, regex, msg.id);
                break;
        }

        if (!sedMsg) {
            throw new HandlerError("No matching message found");
        }

        const replacedContent = sedMsg.content.replace(regex, replace ?? "");

        const username = sedMsg.author.displayName,
            avatar = sedMsg.author.displayAvatarURL(),
            timestamp = sedMsg.editedTimestamp ?? sedMsg.createdTimestamp,
            image = sedMsg.attachments.at(0)?.url,
            channel = Util.formatChannelName(sedMsg.channel);

        const embed = new EmbedBuilder()
            .setAuthor({
                name: username,
                iconURL: avatar
            })
            .setDescription(replacedContent)
            .setTimestamp(timestamp)
            .setImage(image)
            .setFooter({
                text: `From ${channel}`
            });

        logGenTime(t1);
        return embed;
    }
}

export default SedHandler;
