import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

function logUsage(msg, name, args) {
    getLogger().info(
        `User ${msg.author.id} ("${msg.author.username}") used command ${name} in channel ${msg.channel.id} ("${msg.channel.name}").`
    );
}

class CommandHandler extends Handler {
    constructor() {
        super(true, true, true, {
            userCheckInterval: 10000
        });

        this.cmdPrefix = getClient().config.cmdPrefix;
        this.commands = getClient().commands;

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outNewlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);
    }

    async execute(msg) {
        if (!getClient().commandManager.isCommand(msg.content)) {
            return false;
        }

        if (this.userTracker.searchUser(msg.author.id)) {
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
        logUsage(msg, cmd.name, args);

        const ret = await this.executeCommand(msg, cmd, args);
        this.userTracker.removeUser(msg.author.id);

        return ret;
    }

    async executeCommand(msg, cmd, args) {
        let out;

        try {
            const t1 = Date.now();

            out = await cmd.execute(args, msg);

            getLogger().info(`Command execution took ${(Date.now() - t1).toLocaleString()} ms.`);
        } catch (err) {
            const reply = await msg.reply({
                content: `:no_entry_sign: Encountered exception while executing command **${cmd.name}**:`,
                ...Util.getFileAttach(err.stack, "error.js")
            });

            this.messageTracker.addMsg(reply, msg.id);
            getLogger().error("Command execution failed", err);

            return false;
        }

        if (typeof out === "string") {
            const split = out.split("\n");

            if (out.length > this.outCharLimit || split.length > this.outNewlineLimit) {
                out = Util.getFileAttach(out);
            }
        }

        try {
            const reply = await msg.reply(out);
            this.messageTracker.addMsg(reply, msg.id);
        } catch (err) {
            if (err.message === "Cannot send an empty message") {
                const reply = await msg.reply(`:no_entry_sign: ${err.message}.`);
                this.messageTracker.addMsg(reply, msg.id);

                return false;
            }

            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            });
            this.messageTracker.addMsg(reply, msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }
    }
}

export default CommandHandler;
