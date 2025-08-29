import { MessageType, EmbedBuilder, italic } from "discord.js";

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
    if (getLogger().isDebugEnabled()) {
        const text = DiscordUtil.getEmbedData(sed).description;
        getLogger().debug(`Sending replaced message:${LoggerUtil.formatLog(text)}`);
    }
}

function logGenTime(t1) {
    if (getLogger().isDebugEnabled()) {
        const t2 = performance.now(),
            elapsed = Util.timeDelta(t2, t1);

        getLogger().debug(`Sed generation took ${Util.formatNumber(elapsed)} ms.`);
    }
}

function logSendTime(t1) {
    const t2 = performance.now(),
        elapsed = Util.timeDelta(t2, t1);

    getLogger().info(`Sending replaced message took ${Util.formatNumber(elapsed)} ms.`);
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
            throw new HandlerError("Invalid input string", str);
        } else if (match.length < 3) {
            throw new HandlerError("Invalid regex args", str);
        }

        const { body: regexStr } = ParserUtil.parseScript(match.groups.regex_str ?? ""),
            { body: replace } = ParserUtil.parseScript(match.groups.replace ?? ""),
            { body: flagsStr } = ParserUtil.parseScript(match.groups.flags_str ?? "");

        let regex, sedMsg, content;

        try {
            regex = new RegExp(regexStr, flagsStr);
        } catch (err) {
            if (err instanceof SyntaxError) {
                throw new HandlerError("Invalid regex or flags", { regexStr, flagsStr });
            }

            throw err;
        }

        if (isReply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId);
            content = sedMsg.content;

            if (!regex.test(content)) {
                throw new HandlerError("No matching text found", { regex, content });
            }
        } else {
            sedMsg = await this._fetchMatch(msg.channel.id, regex, msg.id);
            content = sedMsg?.content;

            if (content == null) {
                throw new HandlerError("No matching message found", { regex });
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
            if (err.name !== "HandlerError") {
                const out = `generating ${italic(sed)} replace`;
                await this.replyWithError(msg, err, "preview", out);

                return true;
            }

            const emoji = err.message.startsWith("No matching") ? ":no_entry_sign:" : ":warning:";

            getLogger().info(err.message + ".");
            await this.reply(msg, `${emoji} ${err.message}.\n${SedHandler.sedUsage}`);

            return true;
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

            logSendTime(t1);
        } catch (err) {}

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
