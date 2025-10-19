import { RESTJSONErrorCodes } from "discord.js";

import Handler from "../Handler.js";

import ReplyTracker from "./tracker/ReplyTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import VMUtil from "../../util/vm/VMUtil.js";

import MessageLimitTypes from "./MessageLimitTypes.js";
import EmbedCountAreas from "../../util/EmbedCountAreas.js";

class MessageHandler extends Handler {
    constructor(enabled, hasReplyTracker = true, hasUserTracker = false, options = {}) {
        super(enabled, options);

        this.hasReplyTracker = hasReplyTracker;
        this.hasUserTracker = hasUserTracker;

        this.useConfigLimits = options.useConfigLimits ?? false;

        this.setLimits();
    }

    async reply(msg, data, options = {}) {
        const out = this._getOutput(data, options);

        let msgReply = null;

        if (Array.isArray(out)) {
            msgReply = Array(out.length);

            for (const [i, msgOut] of out.entries()) {
                const replyFunc = this._getReplyFunc(msg, i);
                msgReply[i] = await this._reply(msg, replyFunc, msgOut, i);
            }

            msgReply = msgReply.filter(Boolean);
        } else {
            const replyFunc = this._getReplyFunc(msg);
            msgReply = await this._reply(msg, replyFunc, out);
        }

        if (this.hasReplyTracker) {
            this.replyTracker.addReply(msg, msgReply);
        }
    }

    async replyWithError(msg, err, type, out) {
        let msgReply = null;

        if (Array.isArray(err)) {
            msgReply = Array(err.length);

            type = ArrayUtil.guaranteeArray(type, err.length);
            out = ArrayUtil.guaranteeArray(out, err.length);

            for (const [i, msgOut] of err.entries()) {
                const replyFunc = this._getReplyFunc(msg, i);
                msgReply[i] = await this._replyWithExecError(msgOut, replyFunc, type[i], out[i]);
            }

            msgReply = msgReply.filter(Boolean);
        } else {
            type = ArrayUtil.guaranteeFirst(type);
            out = ArrayUtil.guaranteeFirst(out);

            const replyFunc = this._getReplyFunc(msg);
            msgReply = await this._replyWithExecError(err, replyFunc, type, out);
        }

        if (this.hasReplyTracker) {
            this.replyTracker.addReply(msg, msgReply);
        }
    }

    async delete(msg) {
        if (!this.hasReplyTracker) {
            return this._defaultDelete();
        }

        return await this.replyTracker.deleteWithCallback(msg, "reply", msg => msg.delete());
    }

    load() {
        if (this.hasReplyTracker) {
            this.replyTracker = new ReplyTracker(100);
        }

        if (this.hasUserTracker) {
            const userSweepInterval = this.options.userSweepInterval ?? 0;
            this.userTracker = new UserTracker(userSweepInterval);
        }
    }

    unload() {
        if (this.hasReplyTracker) {
            this.replyTracker.clearTrackedMsgs();
        }

        if (this.hasUserTracker) {
            this.userTracker.clearUsers();
            this.userTracker._stopSweepLoop();
        }
    }

    static _mentionRegex = /@(everyone|here)/g;
    static _emptyMessage = "Cannot send an empty message";

    static _formatOutput(data) {
        const msgData = TypeTester.isObject(data);

        const out = msgData ? (({ content: _1, embeds: _2, ...rest }) => rest)(data) : {};

        const rawContent = msgData ? data.content : data,
            content = VMUtil.formatOutput(rawContent)?.trim();

        const rawEmbeds = msgData ? data.embeds : undefined,
            embeds = rawEmbeds?.filter(Boolean).map(embed => DiscordUtil.getBuiltEmbed(embed));

        return { out, content, embeds };
    }

    static _escapeMentions(str) {
        if (typeof str !== "string") {
            return str;
        }

        const codeblockRanges = DiscordUtil.findCodeblocks(str);

        return str.replaceAll(MessageHandler._mentionRegex, (match, p1, offset) => {
            for (const [start, end] of codeblockRanges) {
                if (offset >= start && offset < end) {
                    return match;
                }
            }

            return `\\@${p1}`;
        });
    }

    static _stripPings(out) {
        out.content = MessageHandler._escapeMentions(out.content);

        if (!Array.isArray(out.embeds)) {
            return;
        }

        for (const embed of out.embeds) {
            embed.title = MessageHandler._escapeMentions(embed.title);
            embed.description = MessageHandler._escapeMentions(embed.description);

            if (embed.footer != null) {
                embed.footer.text = MessageHandler._escapeMentions(embed.footer.text);
            }

            if (embed.author != null) {
                embed.author.name = MessageHandler._escapeMentions(embed.author.name);
            }

            if (Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    field.name = MessageHandler._escapeMentions(field.name);
                    field.value = MessageHandler._escapeMentions(field.value);
                }
            }
        }
    }

    _sendTyping(msg) {
        msg.channel.sendTyping().catch(_ => {});
    }

    setLimits(limits) {
        this._outCharLimit = getClient().config.outCharLimit ?? this._outCharLimit;
        this._outLineLimit = getClient().config.outLineLimit ?? this._outLineLimit;

        this._embedCharLimit = getClient().config.embedCharLimit ?? this._embedCharLimit;
        this._embedLineLimit = getClient().config.embedLineLimit ?? this._embedLineLimit;
    }

    getLimits(useConfig = true, useTrim = false) {
        const outChar = useConfig ? this._outCharLimit : DiscordUtil.msgCharLimit,
            outLine = useConfig ? this._outLineLimit : null;

        const embedChar = useConfig ? this._embedCharLimit : DiscordUtil.embedCharLimit,
            embedLine = useConfig ? this._embedLineLimit : null;

        const limits = {
            out: [outChar, outLine],
            embed: [embedChar, embedLine]
        };

        if (useTrim) {
            const outTrim = DiscordUtil.msgCharLimit - outChar < 3 ? DiscordUtil.msgCharLimit - 3 : outChar,
                embedTrim = DiscordUtil.embedCharLimit - embedChar < 3 ? DiscordUtil.embedCharLimit - 3 : embedChar;

            limits.outTrim = [outTrim, outLine];
            limits.embedTrim = [embedTrim, embedLine];
        }

        return limits;
    }

    _applyLimits(data, options) {
        const useConfig = options.useConfigLimits ?? this.useConfigLimits;

        const limitType = options.limitType ?? MessageLimitTypes.default,
            useTrim = limitType === MessageLimitTypes.trim;

        const { out, content, embeds } = MessageHandler._formatOutput(data);

        if (limitType === MessageLimitTypes.none) {
            out.content = content;

            if (!Util.empty(embeds)) {
                out.embeds = embeds;
            }

            return out;
        }

        const addFile = (where, data, name) => {
            const file = Util.first(DiscordUtil.getFileAttach(data, name).files);

            if (Array.isArray(out.files)) {
                switch (where) {
                    case "start":
                        out.files.unshift(file);
                        break;
                    case "end":
                        out.files.push(file);
                        break;
                }
            } else {
                out.files = [file];
            }
        };

        const limits = this.getLimits(useConfig, useTrim),
            { out: outLimits, embed: embedLimits } = limits;

        const contentOversize = Util.overSizeLimits(content, ...outLimits);

        if (contentOversize) {
            switch (limitType) {
                case MessageLimitTypes.default:
                case MessageLimitTypes.file:
                    addFile("end", content);
                    break;
                case MessageLimitTypes.error:
                    const [chars, lines] = contentOversize;

                    if (chars !== null) {
                        return {
                            content: `:warning: Content is too long. (${chars} / ${outLimits[0]})`
                        };
                    } else if (lines !== null) {
                        return {
                            content: `:warning: Content has too many newlines. (${lines} / ${outLimits[1]})`
                        };
                    }

                    break;
                case MessageLimitTypes.trim:
                    out.content = Util.trimString(content, ...limits.outTrim, {
                        oversized: contentOversize
                    });

                    break;
            }
        } else {
            out.content = content;
        }

        if (Util.empty(embeds)) {
            return out;
        }

        let countAreas = useTrim ? EmbedCountAreas.body : EmbedCountAreas.all,
            embedOversize;

        const newEmbeds = [];

        for (const [i, embed] of embeds.entries()) {
            embedOversize = DiscordUtil.overSizeLimits(embed, ...embedLimits, {
                areas: countAreas
            });

            if (!useTrim && !embedOversize) {
                newEmbeds.push(embed);
                continue;
            }

            const n = Util.single(out.embeds) ? "" : ` ${i + 1}`;

            switch (limitType) {
                case MessageLimitTypes.default:
                case MessageLimitTypes.error:
                    const [chars, lines] = embedOversize;

                    if (chars !== null) {
                        return {
                            content: `:warning: Embed${n} is too long. (${chars} / ${embedLimits[0]})`
                        };
                    } else if (lines !== null) {
                        return {
                            content: `:warning: Embed${n} has too many newlines. (${lines} / ${embedLimits[1]})`
                        };
                    }

                    break;
                case MessageLimitTypes.file:
                    const embedFormat = DiscordUtil.stringifyEmbed(embed, `embed${n}.txt`);
                    addFile(`embed${n}.txt`, embedFormat);

                    break;
                case MessageLimitTypes.trim:
                    DiscordUtil.trimEmbed(embed, ...limits.embedTrim, {
                        oversized: embedOversize
                    });

                    newEmbeds.push(embed);
                    break;
            }
        }

        if (!Util.empty(newEmbeds)) {
            out.embeds = newEmbeds;
        }

        return out;
    }

    _getOutput(data, options) {
        let out = "";

        if (Array.isArray(data)) {
            out = data.map(_out => this._applyLimits(_out, options));
            out.forEach(_out => MessageHandler._stripPings(_out));
        } else {
            out = this._applyLimits(data, options);
            MessageHandler._stripPings(out);
        }

        return out;
    }

    _getReplyFunc(msg, i) {
        return !Number.isInteger(i) || i <= 0 ? msg.reply.bind(msg) : msg.channel.send.bind(msg.channel);
    }

    async _replyWithEmptyMsg(replyFunc) {
        return await replyFunc(`:no_entry_sign: ${MessageHandler._emptyMessage}.`);
    }

    async _reply(msg, replyFunc, data, i) {
        if (typeof replyFunc !== "function") {
            return null;
        }

        const n = i != null ? ` ${i}` : "",
            out = `sending reply${n}`;

        const handleError = err => this._replyWithExecError(err, replyFunc, "reply", out),
            handleEmptyMessage = () => this._replyWithEmptyMsg(replyFunc).catch(err => handleError(err));

        if (TypeTester.isObject(data)) {
            if (Util.empty(data.content) && Object.keys(data).every(key => key === "content")) {
                return await handleEmptyMessage();
            }
        } else if (Util.empty(data)) {
            return await handleEmptyMessage();
        }

        try {
            return await replyFunc(data);
        } catch (err) {
            switch (err.code) {
                case RESTJSONErrorCodes.CannotSendAnEmptyMessage:
                    return await handleEmptyMessage();
            }

            return await handleError(err);
        }
    }

    async _replyWithExecError(err1, replyFunc, type, out) {
        getLogger().error(`${Util.capitalize(out)} failed:`, err1);

        if (typeof replyFunc !== "function") {
            return null;
        }

        const errMsg = err1?.stack ?? err1?.message ?? "No error message available";

        try {
            return await replyFunc({
                content: `:no_entry_sign: Encountered exception while ${out}:`,
                ...DiscordUtil.getFileAttach(errMsg, "error.js")
            });
        } catch (err2) {
            getLogger().error(`Reporting ${type} error failed:`, err2);
            return null;
        }
    }
}

export default MessageHandler;
