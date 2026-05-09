import RE2 from "re2";
import { MessageType, EmbedBuilder, bold } from "discord.js";

import MessageHandler from "./MessageHandler.js";
import MessageLimitTypes from "./MessageLimitTypes.js";

import { getClient, getEmoji, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";
import RegexUtil from "../../util/misc/RegexUtil.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import Benchmark from "../../util/misc/Benchmark.js";

import HandlerError from "../../errors/HandlerError.js";

function logUsage(msg) {
    getLogger().info(
        `Generating sed for "${msg.content}", issued by user ${msg.author.id} (${msg.author.username}) in channel ${msg.channel.id} (${DiscordUtil.formatChannelName(msg.channel)}).`
    );
}

function logGenerateCancelled(reason) {
    getLogger().info(`Generating sed cancelled: ${reason}.`);
}

function logSedSending(sed) {
    if (getLogger().isDebugEnabled()) {
        const text = DiscordUtil.getEmbedData(sed).description;
        getLogger().debug(`Sending replaced message:${LoggerUtil.formatLog(text)}`);
    }
}

function logGenerateTime(timeKey) {
    if (!getLogger().isDebugEnabled()) {
        Benchmark.stopTiming(timeKey, null);
        return;
    }

    const elapsed = Benchmark.stopTiming(timeKey, false);
    getLogger().debug(`Sed generation took ${Util.formatNumber(elapsed)} ms.`);
}

function logSendTime(timeKey) {
    const elapsed = Benchmark.stopTiming(timeKey, false);
    getLogger().info(`Sending replaced message took ${Util.formatNumber(elapsed)} ms.`);
}

class SedHandler extends MessageHandler {
    static $name = "sedHandler";

    static sedUsage = "**Usage:** `sed/regex/replace/flags (optional)`";
    static sedRegex =
        /(?:^sed\/|\s+\/)(?<regex_text>(?:\\.|[^/])+)\/(?<replace>(?:\\.|[^/])*)\/?(?<flags_text>(?:\\.|[^/])+?)?(?=\s|$)/gi;
    static defaultFlags = "i";

    constructor(enabled) {
        super(enabled);
    }

    canSed(str) {
        if (!this.enabled || typeof str !== "string") {
            return false;
        }

        return str.toLowerCase().startsWith("sed/");
    }

    async generateSed(msg, str) {
        logUsage(msg);
        const timeKey = Benchmark.startTiming(Symbol("sed_generate"));

        SedHandler.sedRegex.lastIndex = 0;
        const matches = Array.from(str.matchAll(SedHandler.sedRegex));

        if (Util.empty(matches)) {
            throw new HandlerError("Invalid input string", str);
        }

        const singleRule = Util.single(matches),
            expIdx = i => (singleRule ? undefined : i);

        const rules = matches.map((match, i) => {
            if (!match.groups) {
                throw new HandlerError("Invalid regex args", {
                    i: expIdx(i),
                    str: Util.first(match)
                });
            }

            let { regex_text: regexText, replace, flags_text: flagsText } = match.groups;
            regexText = ParserUtil.parseScript(regexText || "").body.replaceAll("\\/", "/");
            replace = ParserUtil.parseScript(replace || "").body.replaceAll("\\/", "/");
            flagsText = ParserUtil.parseScript(flagsText || SedHandler.defaultFlags).body.toLowerCase();

            if (!RegexUtil.validFlags(flagsText)) {
                throw new HandlerError("Invalid regex flags", {
                    i: expIdx(i),
                    flagsText
                });
            }

            try {
                const regex = new RE2(regexText, flagsText);
                return [regex, replace];
            } catch (err) {
                if (err instanceof SyntaxError) {
                    throw new HandlerError("Invalid regex or flags", {
                        i: expIdx(i),
                        regexText,
                        flagsText
                    });
                }

                throw err;
            }
        });

        const mergedRegex = singleRule ? Util.first(rules)[0] : RegexUtil.getMergedRegex(rules.map(rule => rule[0]));

        let sedMsg, content;

        if (msg.type === MessageType.Reply) {
            sedMsg = await getClient().fetchMessage(msg.channel.id, msg.reference.messageId);
            content = sedMsg.content;

            mergedRegex.lastIndex = 0;

            if (!mergedRegex.test(content)) {
                throw new HandlerError("No matching text found", {
                    regex: mergedRegex,
                    content
                });
            }
        } else {
            sedMsg = await this._fetchMatch(msg.channel.id, mergedRegex, msg.id);
            content = sedMsg?.content;

            if (typeof content === "undefined") {
                throw new HandlerError("No matching message found", {
                    regex: mergedRegex
                });
            }
        }

        const replacedContent = singleRule
            ? content.replace(...Util.first(rules))
            : RegexUtil.multipleReplace(content, ...rules);

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

        logGenerateTime(timeKey);
        return embed;
    }

    async execute(msg) {
        if (!this.canSed(msg.content)) {
            return false;
        }

        const timeKey = Benchmark.startTiming(Symbol("sed_send"));

        let sed = null;

        try {
            sed = await this.generateSed(msg, msg.content);
        } catch (err) {
            if (err.name !== "HandlerError") {
                const out = `generating ${bold("sed")} replace`;
                Benchmark.stopTiming(timeKey, null);
                await this.replyWithError(msg, err, "sed", out);

                return true;
            } else if (err.message.startsWith("Invalid input")) {
                Benchmark.stopTiming(timeKey, null);
                logGenerateCancelled(err.message);
                return false;
            }

            Benchmark.stopTiming(timeKey, null);
            getLogger().info(`${err.message}.`);

            const emoji = getEmoji(err.message.startsWith("No matching") ? "error" : "warn"),
                errMsg = err.message + (err.ref?.i ? ` for expression ${bold(err.ref.i + 1)}.` : ".");

            await this.reply(msg, `${emoji} ${errMsg}\n${SedHandler.sedUsage}`);
            return true;
        }

        logSedSending(sed);

        this._sendTyping(msg);
        await this._addDelay(0);

        await this.reply(
            msg,
            {
                embeds: [sed]
            },
            {
                useConfigLimits: true,
                limitType: MessageLimitTypes.trim
            }
        )
            .then(() => logSendTime(timeKey))
            .catch(() => Benchmark.stopTiming(timeKey, null));

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

            regex.lastIndex = 0;
            return regex.test(msg.content);
        });

        return sedMsg ?? null;
    }
}

export default SedHandler;
