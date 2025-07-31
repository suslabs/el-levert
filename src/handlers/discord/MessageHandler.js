import { EmbedBuilder, RESTJSONErrorCodes } from "discord.js";

import Handler from "../Handler.js";

import MessageTracker from "./tracker/MessageTracker.js";
import UserTracker from "./tracker/UserTracker.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import VMUtil from "../../util/vm/VMUtil.js";

class MessageHandler extends Handler {
    constructor(enabled, hasMessageTracker = true, hasUserTracker = false, options = {}) {
        super(enabled, options);

        this.hasMessageTracker = hasMessageTracker;
        this.hasUserTracker = hasUserTracker;

        this.useConfigLimits ??= false;

        this._childDelete = this.delete;
        this.delete = this._delete;

        this._childResubmit = this.resubmit;
        this.resubmit = this._resubmit;
    }

    async reply(msg, data, options = {}) {
        const out = this._getOutput(data, options);

        let msgReply;

        if (Array.isArray(out)) {
            msgReply = [];

            for (const [i, msgOut] of out.entries()) {
                msgReply.push(await this._reply(msg, msgOut, i));
            }

            msgReply = msgReply.filter(Boolean);
        } else {
            msgReply = await this._reply(msg, out);
        }

        this.messageTracker.addReply(msg.id, msgReply);
    }

    load() {
        if (this.hasMessageTracker) {
            this.outCharLimit = getClient().config.outCharLimit;
            this.outLineLimit = getClient().config.outLineLimit;

            this.embedCharLimit = getClient().config.embedCharLimit;
            this.embedLineLimit = getClient().config.embedLineLimit;

            this.messageTracker = new MessageTracker();
        }

        if (this.hasUserTracker) {
            const userSweepInterval = this.options.userSweepInterval ?? 0;
            this.userTracker = new UserTracker(userSweepInterval);
        }
    }

    unload() {
        if (this.hasMessageTracker) {
            this.messageTracker.clearMsgs();
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
            embeds = rawEmbeds?.filter(Boolean).map(embed => (embed instanceof EmbedBuilder ? embed.toJSON() : embed));

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

    _getLimits(useConfig = true, useTrim = false) {
        const outChar = useConfig ? this.outCharLimit : DiscordUtil.msgCharLimit,
            outLine = useConfig ? this.outLineLimit : null;

        const embedChar = useConfig ? this.embedCharLimit : DiscordUtil.embedCharLimit,
            embedLine = useConfig ? this.embedLineLimit : null;

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
        const useConfig = options.useConfigLimits ?? this.useConfigLimits,
            limitType = options.limitType ?? "default",
            useTrim = limitType === "trim";

        const { out, content, embeds } = MessageHandler._formatOutput(data);

        if (limitType === "none") {
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

        const limits = this._getLimits(useConfig, useTrim),
            { out: outLimits, embed: embedLimits } = limits;

        const contentOversize = Util.overSizeLimits(content, ...outLimits);

        if (contentOversize) {
            switch (limitType) {
                case "default":
                case "file":
                    addFile("end", content);
                    break;
                case "error":
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
                case "trim":
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

        let countAreas = useTrim ? "body" : "all",
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
                case "file":
                    const embedFormat = DiscordUtil.stringifyEmbed(embed, `embed${n}.txt`);
                    addFile(`embed${n}.txt`, embedFormat);

                    break;
                case "default":
                case "error":
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
                case "trim":
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
        let out;

        if (Array.isArray(data)) {
            out = data.map(_out => this._applyLimits(_out, options));
            out.forEach(_out => MessageHandler._stripPings(_out));
        } else {
            out = this._applyLimits(data, options);
            MessageHandler._stripPings(out);
        }

        return out;
    }

    async _reply(msg, data, i) {
        let replyFunc;

        if (i > 0) {
            replyFunc = msg.channel.send.bind(msg.channel);
        } else {
            replyFunc = msg.reply.bind(msg);
        }

        if (TypeTester.isObject(data)) {
            if (Util.empty(data.content) && Object.keys(data).every(key => key === "content")) {
                return await this._handleEmptyMessage(replyFunc);
            }
        } else if (Util.empty(data)) {
            return await this._handleEmptyMessage(replyFunc);
        }

        try {
            return await replyFunc(data);
        } catch (err) {
            return await this._handleReplyError(err, replyFunc, i);
        }
    }

    async _handleEmptyMessage(replyFunc) {
        return await replyFunc(`:no_entry_sign: ${MessageHandler._emptyMessage}.`);
    }

    async _handleReplyError(err, replyFunc, i) {
        switch (err.code) {
            case RESTJSONErrorCodes.CannotSendAnEmptyMessage:
                return await this._handleEmptyMessage(replyFunc);
        }

        const n = i != null ? ` ${i}` : "";
        getLogger().error(`Reply${n} failed:`, err);

        try {
            return await replyFunc({
                content: `:no_entry_sign: Encountered exception while sending reply${n}:`,
                ...DiscordUtil.getFileAttach(err.stack, "error.js")
            });
        } catch (err) {
            getLogger().error("Reporting reply error failed:", err);
        }
    }

    _delete(msg) {
        if (!this.enabled) {
            return false;
        }

        let deleteFunc;

        if (typeof this._childDelete === "function") {
            deleteFunc = this._childDelete;
        } else if (this.hasMessageTracker) {
            deleteFunc = this._deleteReply;
        } else {
            deleteFunc = this._defaultDelete;
        }

        return deleteFunc.call(this, msg);
    }

    _defaultDelete() {
        return false;
    }

    async _msgTrackerDelete(msg, itemName, deleteFunc) {
        if (!this.hasMessageTracker) {
            return false;
        }

        const funcName = `delete${Util.capitalize(itemName)}`;

        let sent = this.messageTracker[funcName](msg.id);

        if (sent === null) {
            return false;
        }

        if (Util.single(sent)) {
            sent = Util.first(sent);

            try {
                await deleteFunc(sent);
            } catch (err) {
                getLogger().error(`Could not delete message: ${sent.id}`, err);
            }
        } else {
            await Promise.all(
                sent.map(msg =>
                    Promise.resolve(deleteFunc(msg)).catch(err => {
                        getLogger().error(`Could not delete message ${msg.id}:`, err);
                    })
                )
            );
        }

        return true;
    }

    async _deleteReply(msg) {
        return await this._msgTrackerDelete(msg, "reply", msg => msg.delete());
    }

    _resubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        let resubmitFunc;

        if (typeof this._childResubmit === "function") {
            resubmitFunc = this._childResubmit;
        } else {
            resubmitFunc = this._defaultResubmit;
        }

        return resubmitFunc.call(this, msg);
    }

    async _defaultResubmit(msg) {
        if (!this.enabled) {
            return false;
        }

        let success = await this.delete(msg);
        success ||= await this.execute(msg);

        return success;
    }
}

export default MessageHandler;
