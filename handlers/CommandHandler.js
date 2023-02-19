import Handler from "./Handler.js";

import Util from "../util/Util.js";
import { getClient, getLogger } from "../LevertClient.js";

class CommandHandler extends Handler {
    constructor() {
        super();

        this.cmdPrefix = getClient().config.cmdPrefix;
        this.commands = getClient().commands;

        this.charLimit = Util.clamp(getClient().config.outCharLimit, 0, 2000);
        this.newlineLimit = Util.clamp(getClient().config.outNewlineLimit, 0, 2000);

        this.trackedUsers = [];
    }

    isCmd(str) {
        return str.startsWith(this.cmdPrefix);
    }

    searchCmds(name) {
        return this.commands.find(x => {
            if(x.aliases.length > 0) {
                return (x.name === name || x.aliases.includes(name)) && !x.isSubcmd;
            }
            
            return x.name === name && !x.isSubcmd;
        });
    }

    removeUser(msg) {
        this.trackedUsers = this.trackedUsers.filter(x => x !== msg.author.id);
    }

    async execute(msg) {
        if(!this.isCmd(msg.content)) {
            return false;
        }

        if(this.trackedUsers.includes(msg.author.id)) {
            this.addMsg(await msg.reply(":warning: Please wait for the previous command to finish."));
            return false;
        }

        this.trackedUsers.push(msg.author.id);

        const content = msg.content.slice(this.cmdPrefix.length),
              [name, args] = Util.splitArgs(content);

        const cmd = this.searchCmds(name);

        if(typeof cmd === "undefined") {
            this.removeUser(msg);
            return false;
        }

        await msg.channel.sendTyping();
        getLogger().info(`User ${msg.author.id} ("${msg.author.tag}") used command ${name} in channel ${msg.channel.id} ("${msg.channel.name}").`);
        
        let out;
        
        try {
            const t1 = Date.now();

            out = await cmd.execute(args, msg);

            getLogger().info(`Command execution took ${(Date.now() - t1).toLocaleString()} ms.`);
        } catch(err) {
            this.addMsg(await msg.reply({
                content: `:no_entry_sign: Encountered exception while executing command **${name}**:`,
                ...Util.getFileAttach(err.stack, "error.js")
            }), msg.id);

            getLogger().error("Command execution failed", err);

            this.removeUser(msg);
            return false;
        }
        
        if(typeof out === "string") {
            const split = out.split("\n");
            
            if(out.length > this.charLimit || split.length > this.newlineLimit) {
                out = Util.getFileAttach(out);
            }
        }
        
        try {
            this.addMsg(await msg.reply(out), msg.id);
        } catch(err) {
            if(err.message === "Cannot send an empty message") {
                this.addMsg(await msg.reply(`:no_entry_sign: ${err.message}.`), msg.id);

                this.removeUser(msg);
                return false;
            }

            this.addMsg(await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            }), msg.id);

            getLogger().error("Reply failed", err);

            this.removeUser(msg);
            return false;
        }

        this.removeUser(msg);
        return true;
    }
}

export default CommandHandler;