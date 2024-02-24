import Handler from "./Handler.js";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

function logUsage(msg, name, args) {
    getLogger().info(
        `User ${msg.author.id} ("${msg.author.username}") used command ${name} in channel ${msg.channel.id} ("${msg.channel.name}").`
    );
}

class TrackedUser {
    constructor(id, time) {
        this.id = id;
        this.time = time;
    }
}

function checkUsers() {
    for (const user of this.trackedUsers) {
        const timeDiff = Date.now() - user.time;

        if (timeDiff > this.checkInterval) {
            this.removeUser(user.id);
        }
    }
}

const checkInterval = 1000;

class CommandHandler extends Handler {
    constructor() {
        super(true, true);

        this.cmdPrefix = getClient().config.cmdPrefix;
        this.commands = getClient().commands;

        this.outCharLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.outNewlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);

        this.trackedUsers = [];
        this.checkInterval = checkInterval;

        const checkUsersCb = checkUsers.bind(this);
        setInterval(checkUsersCb, this.checkInterval);
    }

    isCmd(str) {
        return str.startsWith(this.cmdPrefix);
    }

    searchCmds(name) {
        return this.commands.find(x => {
            if (x.aliases.length > 0) {
                return (x.name === name || x.aliases.includes(name)) && !x.isSubcmd;
            }

            return x.name === name && !x.isSubcmd;
        });
    }

    searchUser(id) {
        return this.trackedUsers.find(x => x.id === id);
    }

    addUser(id) {
        const user = new TrackedUser(id, Date.now());
        this.trackedUsers.push(user);
    }

    removeUser(id) {
        this.trackedUsers = this.trackedUsers.filter(x => x.id !== id);
    }

    async execute(msg) {
        if (!this.isCmd(msg.content)) {
            return false;
        }

        if (this.searchUser(msg.author.id)) {
            const reply = await msg.reply(":warning: Please wait for the previous command to finish.");
            this.addMsg(reply, msg.id);

            return false;
        }

        const content = msg.content.slice(this.cmdPrefix.length),
            [name, args] = Util.splitArgs(content);

        const cmd = this.searchCmds(name);

        if (typeof cmd === "undefined") {
            return false;
        }

        await msg.channel.sendTyping();
        this.addUser(msg.author.id);
        logUsage(msg, name, args);

        const ret = await this.executeCommand(msg, cmd, args);
        this.removeUser(msg.author.id);

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

            this.addMsg(reply, msg.id);
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
            this.addMsg(reply, msg.id);
        } catch (err) {
            if (err.message === "Cannot send an empty message") {
                const reply = await msg.reply(`:no_entry_sign: ${err.message}.`);
                this.addMsg(reply, msg.id);

                return false;
            }

            const reply = await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            });
            this.addMsg(reply, msg.id);

            getLogger().error("Reply failed", err);
            return false;
        }
    }
}

export default CommandHandler;
