import { bold, inlineCode, codeBlock } from "discord.js";

import CommandError from "../errors/CommandError.js";

import { getClient } from "../LevertClient.js";
import Util from "../util/Util.js";

async function getPermLevel(options) {
    const { msg, asUser } = options,
        userId = asUser ?? msg?.author.id;

    if (typeof userId === "undefined") {
        return getClient().permManager.getDefaultLevel();
    }

    return await getClient().permManager.maxLevel(msg.author.id);
}

class Command {
    static defaultValues = {
        parent: "",
        allowed: 0,
        ownerOnly: false,
        subcommands: [],
        description: "",
        usage: "",
        aliases: [],
        helpArgs: ["help", "-help", "-h", "usage"],
        category: "none",
        prefix: ""
    };

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

        Util.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        if (this.ownerOnly) {
            this.allowed = getClient().permManager.ownerLevel;
        } else if (this.allowed === getClient().permManager.ownerLevel) {
            this.ownerOnly = true;
        }

        this.subcmds = new Map();
        this.bound = false;
    }

    get hasHelp() {
        return !Util.empty(this.description) || !Util.empty(this.usage);
    }

    matches(name, checkAliases = true) {
        if (this.name === name) {
            return true;
        }

        if (!Util.empty(this.aliases) && checkAliases) {
            return this.aliases.includes(name);
        }

        return false;
    }

    getName(aliasSep = "/", parentSep = ":") {
        let name;

        if (!Util.empty(this.aliases) && aliasSep !== false) {
            const names = [this.name].concat(this.aliases);
            name = names.join(aliasSep);
        } else {
            name = this.name;
        }

        if (this.isSubcmd && parentSep !== false) {
            name = `${this.parentCmd.name}${parentSep} ${name}`;
        }

        return name;
    }

    canExecute(perm) {
        if (!this.ownerOnly) {
            return perm >= this.allowed;
        }

        const canExecute = perm === getClient().permManager.ownerLevel;
        return canExecute ? true : 0;
    }

    getSubcmdNames(includeAliases = true) {
        let cmd = this;

        if (this.isSubcmd) {
            cmd = this.parentCmd;
        }

        if (!includeAliases) {
            return cmd.subcommands;
        }

        const subcmdNames = Array.from(cmd.subcmds.keys());
        return subcmdNames;
    }

    isSubcmdName(name, checkAliases = true) {
        const subcmdNames = this.getSubcmdNames(checkAliases);
        return subcmdNames.includes(name);
    }

    getSubcmdMap(includeAliases = true) {
        let cmd = this;

        if (this.isSubcmd) {
            cmd = this.parentCmd;
        }

        const subMap = cmd.subcmds;

        if (includeAliases) {
            return subMap;
        }

        const entries = Array.from(subMap.entries()),
            uniqueSubcmds = entries.filter(x => x[0] === x[1].name);

        return new Map(uniqueSubcmds);
    }

    getSubcmd(name, includeAliases = true) {
        const subcmds = this.getSubcmdMap(includeAliases);

        if (Util.empty(subcmds)) {
            return;
        }

        return subcmds.get(name);
    }

    getSubcmds(perm) {
        const subList = Array.from(this.getSubcmdMap(false).values());

        if (perm === null || typeof perm === "undefined") {
            return subList;
        }

        const allowedSubcmds = subList.filter(subcmd => subcmd.canExecute(perm));
        return allowedSubcmds;
    }

    getSubcmdList(perm, sep = "|") {
        if (this.isSubcmd) {
            return "";
        }

        let subNames;

        if (perm === null || typeof perm === "undefined") {
            subNames = this.getSubcmdNames();
        } else {
            const subcmds = this.getSubcmds(perm);
            subNames = subcmds.map(command => command.name);
        }

        subNames.sort();
        return subNames.join(sep);
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

    getHelpText(discord = true) {
        let help = "";

        if (!Util.empty(this.description)) {
            const formattedDescription = discord ? codeBlock(this.description) : this.description;
            help += `Description:\n${formattedDescription}`;
        }

        if (!Util.empty(this.usage)) {
            if (!Util.empty(help)) {
                help += "\n\n";
            }

            const formattedUsage = discord ? codeBlock(this.usage) : this.usage;
            help += `Usage:\n${formattedUsage}`;
        }

        return help;
    }

    getArgsHelp(args, discord = true) {
        const hasArgs = typeof args === "string" && !Util.empty(args);

        const prefix = this.prefix + (this.isSubcmd ? this.parent + " " : "");

        const formattedName = this.isSubcmd && discord ? bold(this.name) : this.name,
            formattedArgs = hasArgs ? " " + (discord ? inlineCode(args) : args) : "";

        return `${prefix}${formattedName}${formattedArgs}`;
    }

    getSubcmdHelp(perm, discord = true) {
        const subcmds = this.getSubcmdList(perm),
            formatted = discord ? inlineCode(subcmds) : subcmds;

        return `${this.prefix}${this.name} ${formatted}`;
    }

    addSubcommand(subcmd) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        if (!this.subcommands.includes(subcmd.name)) {
            this.subcommands.push(subcmd.name);
        }

        this.subcmds.set(subcmd.name, subcmd);

        if (!Util.empty(subcmd.aliases)) {
            for (const alias of subcmd.aliases) {
                this.subcmds.set(alias, subcmd);
            }
        }

        subcmd.bind(this);
    }

    removeSubcommand(command) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }
    }

    removeSubcommands() {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        Util.wipeArray(this.subcommands);
        this.subcmds.clear();
    }

    bind(command) {
        if (!this.isSubcmd) {
            throw new CommandError("Can only bind subcommands");
        }

        this.parentCmd = command;
        this.bound = true;
    }

    async execute(args, options = {}) {
        const { msg, asUser, asLevel } = options;

        if (!this.isSubcmd) {
            const [subName, subArgs] = Util.splitArgs(args),
                subCmd = this.getSubcmd(subName);

            if (typeof subCmd !== "undefined") {
                return await subCmd.execute(subArgs, options);
            }
        }

        const perm = asLevel ?? (await getPermLevel({ msg, asUser })),
            canExecute = this.canExecute(perm);

        switch (canExecute) {
            case 0:
                return ":warning: Access denied.\nOnly the bot owner can execute this command.";
            case false:
                return `:warning: Access denied.\nOnly permission level ${this.allowed} and above can execute this command.`;
        }

        if (this.isHelpCall(args)) {
            return this.getHelpText();
        }

        return await this.handler(args, msg, perm);
    }
}

export default Command;
