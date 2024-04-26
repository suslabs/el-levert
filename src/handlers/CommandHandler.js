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
            userSweepInterval: 10000
        });

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

        await this.executeCommand(msg, cmd, args);
        this.userTracker.removeUser(msg.author.id);

        return true;
    }

    async executeCommand(msg, cmd, args) {
        let out;

        try {
            const t1 = Date.now();

            out = await cmd.execute(args, msg);

            getLogger().info(`Command execution took ${(Date.now() - t1).toLocaleString()} ms.`);
        } catch (err1) {
            getLogger().error("Command execution failed:", err1);

            try {
                const reply = await msg.reply({
                    content: `:no_entry_sign: Encountered exception while executing command **${cmd.name}**:`,
                    ...Util.getFileAttach(err1.stack, "error.js")
                });

                this.messageTracker.addMsg(reply, msg.id);
            } catch (err2) {
                getLogger().error("Reporting error failed:", err2);
            }

            return;
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
        } catch (err1) {
            if (err1.message === "Cannot send an empty message") {
                const reply = await msg.reply(`:no_entry_sign: ${err1.message}.`);
                this.messageTracker.addMsg(reply, msg.id);

                return;
            }

            getLogger().error("Reply failed:", err1);

            try {
                const reply = await msg.reply({
                    content: ":no_entry_sign: Encountered exception while sending reply:",
                    ...Util.getFileAttach(err1.stack, "error.js")
                });

                this.messageTracker.addMsg(reply, msg.id);
            } catch (err2) {
                getLogger().error("Reporting error failed:", err2);
            }

            return;
        }
    }
}

export default CommandHandler;
