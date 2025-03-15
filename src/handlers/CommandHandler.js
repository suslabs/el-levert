import { bold } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";
import VMUtil from "../util/vm/VMUtil.js";

function logUsage(msg, name, args) {
    const cmdArgs = !Util.empty(args) ? ` with args:${Util.formatLog(args)}` : ".";

    getLogger().info(
        `User ${msg.author.id} (${msg.author.username}) used command "${name}" in channel ${msg.channel.id} (${Util.formatChannelName(msg.channel)})${cmdArgs}`
    );
}

function logTime(t1) {
    const t2 = performance.now();
    getLogger().info(`Command execution took ${Util.timeDelta(t2, t1).toLocaleString()}ms.`);
}

function logOutput(cmd, out) {
    getLogger().debug(`Command "${cmd.name}" returned:${Util.formatLog(out)}`);
}

class CommandHandler extends Handler {
    static $name = "commandHandler";
    priority = 1;

    constructor() {
        super(true, true, true, {
            userSweepInterval: 10 / Util.durationSeconds.milli
        });

        this.minResponseTime = getClient().config.minResponseTime / Util.durationSeconds.milli;

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outLineLimit = Util.clamp(getClient().config.outLineLimit, 0, 2000);
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content, msg.author.id)) {
            return false;
        }

        if (this.userTracker.findUser(msg.author.id)) {
            const reply = await msg.reply(":warning: Please wait for the previous command to finish.");
            this.messageTracker.addMsg(reply, msg.id);

            return false;
        }

        const [cmd, args] = getClient().commandManager.getCommand(msg.content, msg.author.id);

        if (typeof cmd === "undefined") {
            return false;
        }

        await msg.channel.sendTyping();
        this.userTracker.addUser(msg.author.id);

        await this._executeAndReply(cmd, msg, args);
        this.userTracker.removeUser(msg.author.id);

        return true;
    }

    _processResult(res) {
        const msgRes = res !== null && typeof res === "object",
            str = VMUtil.formatOutput(msgRes ? res.content : res)?.trim();

        let out = msgRes ? res : {};

        if (Util.overSizeLimits(str, this.outCharLimit, this.outLineLimit)) {
            const files = Util.getFileAttach(str).files;
            out.files = out.files ? [...files, ...out.files] : files;
        } else {
            out.content = str;
        }

        if (!Array.isArray(out.embeds)) {
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
                return `:warning: Embed${n} is too long. (${chars} / ${this.outCharLimit})`;
            }

            if (lines !== null) {
                return `:warning: Embed${n} has too many newlines. (${lines} / ${this.outLineLimit})`;
            }
        }

        return out;
    }

    async _executeCommand(cmd, msg, args) {
        logUsage(msg, cmd.name, args);

        const t1 = performance.now(),
            res = await cmd.execute(args, { msg });

        logTime(t1);
        return this._processResult(res);
    }

    async _addDelay(t1) {
        const t2 = performance.now(),
            time = Util.timeDelta(t2, t1);

        if (time < this.minResponseTime) {
            const delay = this.minResponseTime - time;
            await Util.delay(delay);
        }
    }

    async _executeAndReply(cmd, msg, args) {
        const t1 = performance.now();

        let out;

        try {
            out = await this._executeCommand(cmd, msg, args);
            await this._addDelay(t1);
        } catch (err) {
            await this._addDelay(t1);

            await this.handleExecutionError(err, msg, cmd);
            return;
        }

        logOutput(cmd, out);

        try {
            const reply = await msg.reply(out);
            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            await this._handleReplyError(err, msg);
            return;
        }
    }

    async handleExecutionError(err, msg, cmd) {
        getLogger().error("Command execution failed:", err);

        try {
            const reply = await msg.reply({
                content: `:no_entry_sign: Encountered exception while executing command ${bold(cmd.name)}:`,
                ...Util.getFileAttach(err.stack ?? err.toString(), "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            getLogger().error("Reporting error failed:", err);
        }
    }

    async _handleReplyError(err, msg) {
        if (err.message === "Cannot send an empty message") {
            const reply = await msg.reply(`:no_entry_sign: ${err.message}.`);
            this.messageTracker.addMsg(reply, msg.id);

            return;
        }

        getLogger().error("Reply failed:", err);

        try {
            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            getLogger().error("Reporting error failed:", err);
        }
    }
}

export default CommandHandler;
