import CommandError from "../errors/CommandError.js";
import Util from "../util/Util.js";
import { getClient } from "../LevertClient.js";

class Command {
    constructor(options) {
        this.name = options.name;
        this.parent = options.parent || "";

        this.allowed = options.allowed || 0;
        this.subNames = options.subcommands || [],
        
        this.description = options.description || "";
        this.usage = options.usage || "";

        this.load = options.load;
        this.handler = options.handler;

        if(typeof options.name === "undefined") {
            throw new CommandError("Command must have a name.");
        }

        if(typeof options.handler === "undefined") {
            throw new CommandError("Command must have a handler.");
        }

        this.subcmds = [];
        this.isSubcmd = options.subcommand || false;

        this.hasHelp = typeof options.description !== "undefined" || typeof options.usage !== "undefined";
        this.helpArgs = options.helpArgs || ["-h", "-u", "-help", "help"];
    }

    searchSubcmds(name) {
        if(this.subcmds.length < 1) {
            return;
        }

        return this.subcmds.find(x => {
            return x.name === name;
        });
    }

    getHelp() {
        let help = "";

        if(this.description.length > 0) {
            help += `Description:\n\`\`\`\n${this.description}\n\`\`\``;

            if(typeof this.usage !== "undefined") {
                help += "\n\n";
            }
        }

        if(this.usage.length > 0) {
            help += `Usage:\n\`\`\`\n${this.usage}\n\`\`\``;
        }
        
        return help;
    }

    async execute(args, msg) {
        const [subName, subArgs] = Util.splitArgs(args),
              subCmd = this.searchSubcmds(subName);

        if(typeof subCmd !== "undefined") {
            return subCmd.execute(subArgs, msg);
        }

        const perm = await getClient().permManager.maxLevel(msg.author.id);

        if(perm < this.allowed) {
            return `:warning: Access denied.\nOnly permission level ${this.allowed} and above can execute this command.`;
        }

        if(this.hasHelp && this.helpArgs.includes(args.toLowerCase())) {
            return this.getHelp();
        }

        return await this.handler(args, msg, perm);
    }
}

export default Command;