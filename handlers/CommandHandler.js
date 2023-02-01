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
            return x.name === name && !x.isSubcmd;
        });
    }

    removeUser(msg) {
        this.trackedUsers = this.trackedUsers.filter(x => x !== msg.author.id);
    }

    async execute(msg) {
        if(!this.isCmd(msg.content)) {
            return;
        }

        if(this.trackedUsers.includes(msg.author.id)) {
            this.addReply(await msg.reply(":warning: Please wait for the previous command to finish."));

            return;
        }

        this.trackedUsers.push(msg.author.id);

        const content = msg.content.slice(this.cmdPrefix.length),
              [name, args] = Util.splitArgs(content);

        const cmd = this.searchCmds(name);

        if(typeof cmd === "undefined") {
            this.removeUser(msg);
            return;
        }

        await msg.channel.sendTyping();
        getLogger().info(`User ${msg.author.id} ("${msg.author.tag}") used command ${name} in channel ${msg.channel.id} ("${msg.channel.name}").`);
        
        let out;

        try {
            out = await cmd.execute(args, msg);
        } catch(err) {
            this.addReply(await msg.reply({
                content: `:no_entry_sign: Encountered exception while executing command **${name}**:`,
                ...Util.getFileAttach(err.stack, "error.js")
            }));

            getLogger().error("Command execution failed", err);

            this.removeUser(msg);
            return;
        }

        if(typeof out === "string") {
            const split = out.split("\n");
            
            if(out.length > this.charLimit || split.length > this.newlineLimit) {
                out = Util.getFileAttach(out);
            }
        }
        
        try {
            this.addReply(await msg.reply(out));
        } catch(err) {
            if(err.message === "Cannot send an empty message") {
                this.addReply(await msg.reply(`:no_entry_sign: ${err.message}.`));

                this.removeUser(msg);
                return;
            }

            this.addReply(await msg.reply({
                content: ":no_entry_sign: Encountered exception while sending reply:",
                ...Util.getFileAttach(err.stack, "error.js")
            }));

            getLogger().error("Reply failed", err);

            this.removeUser(msg);
            return;
        }

        this.removeUser(msg);
    }
}

export default CommandHandler;