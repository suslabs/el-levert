import { bold } from "discord.js";

import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

function logUsage(msg, name, args) {
    const cmdArgs = args.length > 0 ? ` with args:${Util.formatLog(args)}` : ".";

    getLogger().info(
        `User ${msg.author.id} (${msg.author.username}) used command "${name}" in channel ${msg.channel.id} (${msg.channel.name})${cmdArgs}`
    );
}

function logTime(t1) {
    getLogger().info(`Command execution took ${(Date.now() - t1).toLocaleString()}ms.`);
}

function logOutput(cmd, out) {
    getLogger().debug(`Command "${cmd.name}" returned:${Util.formatLog(out)}`);
}

class CommandHandler extends Handler {
    static name = "commandHandler";
    priority = 1;

    constructor() {
        super(true, true, true, {
            userSweepInterval: 10 / Util.durationSeconds.milli
        });

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outNewlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content)) {
            return false;
        }

        if (this.userTracker.findUser(msg.author.id)) {
            const reply = await msg.reply(":warning: Please wait for the previous command to finish.");
            this.messageTracker.addMsg(reply, msg.id);

            return false;
        }

        const [cmd, args] = getClient().commandManager.getCommand(msg.content);

        if (typeof cmd === "undefined") {
            return false;
        }

        await msg.channel.sendTyping();
        this.userTracker.addUser(msg.author.id);

        await this.executeAndReply(cmd, msg, args);
        this.userTracker.removeUser(msg.author.id);

        return true;
    }

    async executeCommand(cmd, msg, args) {
        logUsage(msg, cmd.name, args);
        const t1 = Date.now();

        let out = await cmd.execute(args, { msg });

        if (typeof out === "string") {
            const split = out.split("\n");

            if (out.length > this.outCharLimit || split.length > this.outNewlineLimit) {
                out = Util.getFileAttach(out);
            }
        }

        logTime(t1);
        return out;
    }

    async executeAndReply(cmd, msg, args) {
        let out;

        try {
            out = await this.executeCommand(cmd, msg, args);
        } catch (err) {
            await this.handleExecutionError(err, msg, cmd);
            return;
        }

        logOutput(cmd, out);

        try {
            const reply = await msg.reply(out);
            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            await this.handleReplyError(err, msg);
            return;
        }
    }

    async handleExecutionError(err, msg, cmd) {
        getLogger().error("Command execution failed:", err);

        try {
            const reply = await msg.reply({
                content: `:no_entry_sign: Encountered exception while executing command ${bold(cmd.name)}:`,
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            getLogger().error("Reporting error failed:", err);
        }
    }

    async handleReplyError(err, msg) {
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
