import { codeBlock } from "discord.js";

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
    static defaultValues = defaultValues;

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

        if (this.ownerOnly) {
            this.allowed = getClient().permManager.ownerLevel;
        } else if (this.allowed === getClient().permManager.ownerLevel) {
            this.ownerOnly = true;
        }

        this.subcmds = new Map();
        this.bound = false;
    }

    get hasHelp() {
        return this.description.length > 0 || this.usage.length > 0;
    }

    matches(name, checkAliases = true) {
        if (this.name === name) {
            return true;
        }

        if (this.aliases.length > 0 && checkAliases) {
            return this.aliases.includes(name);
        }

        return false;
    }

    getName(aliasSep = "/", parentSep = ":") {
        let name;

        if (this.aliases.length > 0 && aliasSep !== false) {
            const names = [this.name].concat(this.aliases);
            name = names.join(aliasSep);
        } else {
            name = this.name;
        }

        if (this.isSubcmd && parentSep !== false) {
            name = this.parentCmd.name + `${parentSep} ` + name;
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

    getSubNames(includeAliases = true) {
        let cmd = this;

        if (this.isSubcmd) {
            cmd = this.parentCmd;
        }

        if (!includeAliases) {
            return cmd.subcommands;
        }

        const subNames = Array.from(cmd.subcmds.keys());
        return subNames;
    }

    isSubName(name, checkAliases = true) {
        const subNames = this.getSubNames(checkAliases);
        return subNames.includes(name);
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

        if (subcmds.size < 1) {
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
            subNames = this.getSubNames();
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

        if (this.description.length > 0) {
            const formattedDescription = discord ? codeBlock(this.description) : this.description;
            help += `Description:\n${formattedDescription}`;
        }

        if (this.usage.length > 0) {
            if (help.length > 0) {
                help += "\n\n";
            }

            const formattedUsage = discord ? codeBlock(this.usage) : this.usage;
            help += `Usage:\n${formattedUsage}`;
        }

        return help;
    }

    addSubcommand(command) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        this.subcmds.set(command.name, command);

        if (command.aliases.length > 0) {
            for (const alias of command.aliases) {
                this.subcmds.set(alias, command);
            }
        }

        command.bind(this);
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
