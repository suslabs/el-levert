import { bold } from "discord.js";

import MessageHandler from "../MessageHandler.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import { isObject } from "../../util/misc/TypeTester.js";
import VMUtil from "../../util/vm/VMUtil.js";

function logUsage(msg, name, args) {
    const cmdArgs = !Util.empty(args) ? ` with args:${Util.formatLog(args)}` : ".";

    getLogger().info(
        `User ${msg.author.id} (${msg.author.username}) used command "${name}" in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)})${cmdArgs}`
    );
}

function logTime(time) {
    getLogger().info(`Command execution took ${Util.formatNumber(time)}ms.`);
}

function logOutput(cmd, out) {
    getLogger().debug(`Command "${cmd.name}" returned:${Util.formatLog(out)}`);
}

class CommandHandler extends MessageHandler {
    static $name = "commandHandler";
    priority = 1;

    constructor(enabled) {
        super(enabled, true, true, {
            userSweepInterval: 10 / Util.durationSeconds.milli
        });

        this.minResponseTime = getClient().config.minResponseTime / Util.durationSeconds.milli;

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outLineLimit = Util.clamp(getClient().config.outLineLimit, 0, 2000);
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content, msg)) {
            return false;
        }

        if (this.userTracker.findUser(msg.author.id)) {
            await this.reply(msg, ":warning: Please wait for the previous command to finish.");
            return false;
        }

        const [cmd, _, args] = getClient().commandManager.getCommand(msg.content, msg);

        if (cmd === null) {
            return false;
        }

        await msg.channel.sendTyping();
        this.userTracker.addUser(msg.author.id);

        await this._executeAndReply(cmd, msg, args);
        this.userTracker.removeUser(msg.author.id);

        return true;
    }

    static _mentionRegex = /@(everyone|here)/g;

    async _executeAndReply(cmd, msg, args) {
        const t1 = performance.now();

        let out,
            execErr = null;

        try {
            const [res] = await this._executeCommand(cmd, msg, args);

            out = this._processResult(res);
            this._stripPings(out);
        } catch (err) {
            execErr = err;
        }

        await this._addDelay(t1);

        if (execErr !== null) {
            await this._handleExecutionError(execErr, msg, cmd);
            return;
        }

        logOutput(cmd, out);

        try {
            await this.reply(msg, out);
        } catch (err) {
            await this._handleReplyError(err, msg);
            return;
        }
    }

    async _executeCommand(cmd, msg, args) {
        logUsage(msg, cmd.name, args);

        const t1 = performance.now();

        const res = await cmd.execute(args, { msg });

        const t2 = performance.now(),
            time = Util.timeDelta(t2, t1);

        logTime(time);
        return [res, time];
    }

    _processResult(res) {
        const msgRes = isObject(res),
            str = VMUtil.formatOutput(msgRes ? res.content : res)?.trim();

        let out = msgRes ? (({ content, ...rest }) => rest)(res) : {};

        if (Util.overSizeLimits(str, this.outCharLimit, this.outLineLimit)) {
            const files = Util.getFileAttach(str).files;
            out.files = out.files ? [...files, ...out.files] : files;
        } else {
            out.content = str;
        }

        if (!Array.isArray(out.embeds)) {
            return out;
        }

        out.embeds = out.embeds.filter(embed => embed != null);

        if (Util.empty(out.embeds)) {
            return out;
        }

        for (const [i, embed] of out.embeds.entries()) {
            const oversized = Util.overSizeLimits(embed, this.outCharLimit, this.outLineLimit);

            if (!oversized) {
                continue;
            }

            const [chars, lines] = oversized,
                n = Util.single(out.embeds) ? "" : ` ${i + 1}`;

            if (chars !== null) {
                return {
                    content: `:warning: Embed${n} is too long. (${chars} / ${this.outCharLimit})`
                };
            } else if (lines !== null) {
                return {
                    content: `:warning: Embed${n} has too many newlines. (${lines} / ${this.outLineLimit})`
                };
            }
        }

        return out;
    }

    _escapeMentions(str) {
        if (typeof str !== "string") {
            return str;
        }

        const codeblockRanges = Util.findCodeblocks(str);

        return str.replaceAll(CommandHandler._mentionRegex, (match, p1, offset) => {
            for (const [start, end] of codeblockRanges) {
                if (offset >= start && offset < end) {
                    return match;
                }
            }

            return `\\@${p1}`;
        });
    }

    _stripPings(out) {
        out.content = this._escapeMentions(out.content);

        if (!Array.isArray(out.embeds)) {
            return out;
        }

        for (const embed of out.embeds) {
            embed.title = this._escapeMentions(embed.title);
            embed.description = this._escapeMentions(embed.description);

            if (embed.footer != null) {
                embed.footer.text = this._escapeMentions(embed.footer.text);
            }

            if (embed.author != null) {
                embed.author.name = this._escapeMentions(embed.author.name);
            }

            if (Array.isArray(embed.fields)) {
                for (const field of embed.fields) {
                    field.name = this._escapeMentions(field.name);
                    field.value = this._escapeMentions(field.value);
                }
            }
        }

        return out;
    }

    async _addDelay(t1) {
        if (this.minResponseTime <= 0) {
            return;
        }

        const t2 = performance.now(),
            time = Util.timeDelta(t2, t1);

        if (time < this.minResponseTime) {
            const delay = this.minResponseTime - time;
            await Util.delay(delay);
        }
    }

    async _handleExecutionError(err, msg, cmd) {
        getLogger().error("Command execution failed:", err);

        try {
            await this.reply(msg, {
                content: `:no_entry_sign: Encountered exception while executing command ${bold(cmd.name)}:`,
                ...Util.getFileAttach(err.stack ?? err.toString(), "error.js")
            });
        } catch (err) {
            getLogger().error("Reporting error failed:", err);
        }
    }

    async _handleReplyError(err, msg) {
        if (err.message === "Cannot send an empty message") {
            return await this.reply(msg, `:no_entry_sign: ${err.message}.`);
        }

        getLogger().error("Reply failed:", err);

        try {
            await this.reply(msg, {
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            });
        } catch (err) {
            getLogger().error("Reporting error failed:", err);
        }
    }
}

export default CommandHandler;
