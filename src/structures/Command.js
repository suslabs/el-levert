import CommandError from "../errors/CommandError.js";

import { getClient } from "../LevertClient.js";

import Util from "../util/Util.js";

const defaultValues = {
    parent: "",
    allowed: 0,
    ownerOnly: false,
    subcommands: [],
    description: "",
    usage: "",
    aliases: [],
    helpArgs: ["help", "-help", "-h", "usage"],
    category: "none"
};

class Command {
    constructor(options) {
        if (typeof options.name === "undefined") {
            throw new CommandError("Command must have a name");
        }

        if (typeof options.handler === "undefined") {
            throw new CommandError("Command must have a handler");
        }

        if (options.subcommand && typeof options.parent === "undefined") {
            throw new CommandError("Subcommands must have a parent command");
        }

        this.isSubcmd = options.subcommand ?? false;
        delete options.subcommand;

        Util.setValuesWithDefaults(this, options, defaultValues);

        this.subcmds = new Map();
    }

    get hasHelp() {
        return this.description.length > 0 || this.usage.length > 0;
    }

    matches(name) {
        if (this.name === name) {
            return true;
        }

        if (this.aliases.length > 0) {
            return this.aliases.includes(name);
        }

        return false;
    }

    getName() {
        let names = [this.name].concat(this.aliases);
        names = names.join("/");

        if (this.isSubcmd) {
            return this.parentCmd.name + ": " + names;
        }

        return names;
    }

    getSubcmdNames() {
        let subNames;

        if (this.isSubcmd) {
            subNames = this.parentCmd.subcommands;
        } else {
            subNames = this.subcommands;
        }

        return subNames;
    }

    isSubName(name) {
        const subNames = this.getSubcmdNames();
        return subNames.includes(name);
    }

    getSubcmdMap() {
        let subcmds;

        if (this.isSubcmd) {
            subcmds = this.parentCmd.subcmds;
        } else {
            subcmds = this.subcmds;
        }

        return subcmds;
    }

    getSubcmd(name) {
        const subcmds = this.getSubcmdMap();

        if (subcmds.size < 1) {
            return;
        }

        return subcmds.get(name);
    }

    getSubcmds(perm) {
        const subcmds = this.getSubcmdMap(),
            subcmdList = Array.from(subcmds.entries())
                .filter(x => x[0] === x[1].name)
                .map(x => x[1]);

        if (typeof perm === "undefined") {
            return subcmdList;
        }

        const allowedSubcmds = subcmdList.filter(subcmd => {
            if (subcmd.ownerOnly) {
                return perm === getClient().permManager.owner.level;
            }

            return perm >= subcmd.allowed;
        });

        return allowedSubcmds;
    }

    getSubcmdList(perm, separator = "|") {
        if (this.isSubcmd) {
            return "";
        }

        let subNames;

        if (typeof perm === "undefined") {
            subNames = this.getSubcmdNames();
        } else {
            const subcmds = this.getSubcmds(perm);
            subNames = subcmds.map(command => command.name);
        }

        return subNames.join(separator);
    }

    isHelpCall(args) {
        if (!this.hasHelp) {
            return false;
        }

        const split = args.split(" ");

        for (const part of split) {
            if (this.helpArgs.includes(part)) {
                return true;
            }
        }

        return false;
    }

    getHelpText() {
        let help = "";

        if (this.description.length > 0) {
            help += `Description:\n\`\`\`\n${this.description}\n\`\`\``;

            if (typeof this.usage !== "undefined") {
                help += "\n\n";
            }
        }

        if (this.usage.length > 0) {
            help += `Usage:\n\`\`\`\n${this.usage}\n\`\`\``;
        }

        return help;
    }

    async execute(args, msg) {
        if (!this.isSubcmd) {
            const [subName, subArgs] = Util.splitArgs(args),
                subCmd = this.getSubcmd(subName);

            if (typeof subCmd !== "undefined") {
                return await subCmd.execute(subArgs, msg);
            }
        }

        let perm;

        if (typeof msg !== "undefined") {
            perm = await getClient().permManager.maxLevel(msg.author.id);
        } else {
            perm = getClient().permManager.ownerLevel;
        }

        if (this.ownerOnly && perm !== getClient().permManager.ownerLevel) {
            return ":warning: Access denied.\nOnly the bot owner can execute this command.";
        }

        if (perm < this.allowed) {
            return `:warning: Access denied.\nOnly permission level ${this.allowed} and above can execute this command.`;
        }

        if (this.isHelpCall(args)) {
            return this.getHelpText();
        }

        return await this.handler(args, msg, perm);
    }
}

export default Command;
