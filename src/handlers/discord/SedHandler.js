import { ChannelType, MessageType, EmbedBuilder } from "discord.js";

import MessageHandler from "../MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import HandlerError from "../../errors/HandlerError.js";

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
    getLogger().debug(`Sed generation took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

function logSendTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending replaced message took ${Util.formatNumber(Util.timeDelta(t2, t1))}ms.`);
}

class SedHandler extends MessageHandler {
    static $name = "sedHandler";

    static sedUsage = "Usage: sed/regex/replace/flags (optional)";
    static sedRegex = /^sed\/(?<regex_str>.+?)\/(?<replace>[^/]*)\/?(?<flags_str>.{1,2})?/;
    static defaultFlags = "i";

    constructor(enabled) {
        super(enabled, true);
    }

    async execute(msg) {
        if (!this._canSed(msg.content)) {
            return false;
        }

        const t1 = performance.now();

        let sed;

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

                await this.reply(msg, `${emoji} ${err.message}.\n${SedHandler.sedUsage}`);
                return true;
            }

            await this.reply(msg, {
                content: ":no_entry_sign: Encountered exception while generating sed replace:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            getLogger().error("Sed generation failed:", err);
            return false;
        }

        logSending(sed);

        try {
            await this.reply(msg, {
                embeds: [sed]
            });
        } catch (err) {
            await this.reply(msg, {
                content: `:no_entry_sign: Encountered exception while sending sed replace:`,
                ...Util.getFileAttach(err.stack, "error.js")
            });

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

        return SedHandler.sedRegex.test(str);
    }

    async _fetchMatch(ch_id, regex, ignore_id, limit = 100) {
        const msgs = await getClient().fetchMessages(ch_id, { limit });

        if (msgs === null) {
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

        const t1 = performance.now();

        const match = str.match(SedHandler.sedRegex);

        if (!match) {
            throw new HandlerError("Invalid input string");
        }

        const { regex_str, replace, flags_str } = match.groups,
            flags = flags_str ?? "" + SedHandler.defaultFlags;

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

        if (sedMsg === null) {
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
