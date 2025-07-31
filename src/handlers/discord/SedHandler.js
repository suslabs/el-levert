import { MessageType, EmbedBuilder } from "discord.js";

import MessageHandler from "./MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";

import HandlerError from "../../errors/HandlerError.js";

function logUsage(msg) {
    getLogger().info(
        `Generating sed for "${msg.content}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logSending(sed) {
    if (!getLogger().isDebugEnabled()) {
        return;
    }

    const text = DiscordUtil.getEmbed(sed).description;
    getLogger().debug(`Sending replaced message:${LoggerUtil.formatLog(text)}`);
}

function logGenTime(t1) {
    if (!getLogger().isDebugEnabled()) {
        return;
    }

    const t2 = performance.now();
    getLogger().debug(`Sed generation took ${Util.formatNumber(Util.timeDelta(t2, t1))} ms.`);
}

function logSendTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Sending replaced message took ${Util.formatNumber(Util.timeDelta(t2, t1))} ms.`);
}

class SedHandler extends MessageHandler {
    static $name = "sedHandler";

    static sedUsage = "**Usage:** `sed/regex/replace/flags (optional)`";
    static sedRegex = /^sed\/(?<regex_str>.+?)\/(?<replace>[^/]*)\/?(?<flags_str>.{1,2})?/;
    static defaultFlags = "i";

    constructor(enabled) {
        super(enabled);
    }

    canSed(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return SedHandler.sedRegex.test(str);
    }

    async generateSed(msg, str) {
        logUsage(msg);
        const t1 = performance.now();

        const isReply = msg.type === MessageType.Reply,
            match = str.match(SedHandler.sedRegex);

        if (!match) {
            throw new HandlerError("Invalid input string");
        }

        if (match.length < 3) {
            throw new HandlerError("Invalid regex args");
        }

        const { body: regex_str } = ParserUtil.parseScript(match.groups.regex_str ?? ""),
            { body: replace } = ParserUtil.parseScript(match.groups.replace ?? ""),
            { body: flags_str } = ParserUtil.parseScript(match.groups.flags_str ?? "");

        let regex, sedMsg, content;

        try {
            regex = new RegExp(regex_str, flags_str);
        } catch (err) {
            if (err instanceof SyntaxError) {
                throw new HandlerError("Invalid regex or flags");
            }

            throw err;
        }

        if (isReply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId);
            content = sedMsg.content;

            if (!regex.test(content)) {
                throw new HandlerError("No matching text found");
            }
        } else {
            sedMsg = await this._fetchMatch(msg.channel.id, regex, msg.id);
            content = sedMsg?.content;

            if (content == null) {
                throw new HandlerError("No matching message found");
            }
        }

        const replacedContent = content.replace(regex, replace ?? "");

        const username = sedMsg.author.displayName,
            avatar = sedMsg.author.displayAvatarURL(),
            timestamp = sedMsg.editedTimestamp ?? sedMsg.createdTimestamp,
            image = sedMsg.attachments.at(0)?.url,
            channel = DiscordUtil.formatChannelName(sedMsg.channel);

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

    async execute(msg) {
        if (!this.canSed(msg.content)) {
            return false;
        }

        const t1 = performance.now();
        this._sendTyping(msg);

        let sed;

        try {
            sed = await this.generateSed(msg, msg.content);
        } catch (err) {
            if (err.name === "HandlerError") {
                let emoji;

                if (err.message.startsWith("No")) {
                    emoji = ":no_entry_sign:";
                } else {
                    emoji = ":warning:";
                }

                getLogger().info(err.message + ".");
                await this.reply(msg, `${emoji} ${err.message}.\n${SedHandler.sedUsage}`);

                return true;
            }

            getLogger().error("Sed generation failed:", err);

            await this.reply(msg, {
                content: ":no_entry_sign: Encountered exception while generating sed replace:",
                ...DiscordUtil.getFileAttach(err.stack, "error.js")
            });

            return false;
        }

        logSending(sed);

        try {
            await this.reply(
                msg,
                {
                    embeds: [sed]
                },
                {
                    useConfigLimits: true,
                    limitType: "trim"
                }
            );
        } catch (err) {
            return true;
        }

        logSendTime(t1);
        return true;
    }

    async _fetchMatch(ch_id, regex, ignore_id, limit = 100) {
        const msgs = await getClient().fetchMessages(ch_id, { limit }),
            botId = getClient().botId;

        if (msgs === null) {
            return null;
        }

        const sedMsg = msgs.find(msg => {
            if (msg.id === ignore_id || msg.author.id === botId || this.canSed(msg.content)) {
                return false;
            }

            return regex.test(msg);
        });

        return sedMsg ?? null;
    }
}

export default SedHandler;
