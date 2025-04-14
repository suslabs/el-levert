import { bold, inlineCode, codeBlock } from "discord.js";

import BaseCommand from "./BaseCommand.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

class TextCommand extends BaseCommand {
    static defaultValues = {
        ...BaseCommand.defaultValues,
        description: "",
        usage: "",
        aliases: [],
        helpArgs: ["help", "-help", "-h", "usage"],
        category: "none",
        prefix: ""
    };

    get hasHelp() {
        return !Util.empty(this.description) || !Util.empty(this.usage);
    }

    matches(name, checkAliases = true) {
        if (super.matches(name)) {
            return true;
        } else if (checkAliases && !Util.empty(this.aliases)) {
            return this.aliases.includes(name);
        } else {
            return false;
        }
    }

    matchesSubcmd(name, checkAliases = true) {
        return this.getSubcmdNames(checkAliases).includes(name);
    }

    getName(aliasSep = "/", parentSep) {
        let name = this.name;

        if (aliasSep !== false && !Util.empty(this.aliases)) {
            const names = [name].concat(this.aliases);
            name = names.join(aliasSep);
        }

        return super._getName(name, parentSep);
    }

    getSubcmd(name, includeAliases = true) {
        const subcmds = this.getSubcmdMap(includeAliases);
        return subcmds.get(name) ?? null;
    }

    getSubcmdNames(includeAliases = true) {
        if (includeAliases) {
            return Array.from(super.getSubcmdMap().keys());
        } else {
            return super.getSubcmdNames();
        }
    }

    getSubcmds() {
        return Array.from(this.getSubcmdMap(false).values());
    }

    getSubcmdList(includeAliases = true, sep = "|") {
        if (this.isSubcmd) {
            return "";
        }

        let subNames = this.getSubcmdNames(includeAliases);
        ArrayUtil.sort(subNames);

        return subNames.join(sep);
    }

    getSubcmdMap(includeAliases = true) {
        const subMap = super.getSubcmdMap();

        if (includeAliases) {
            return subMap;
        }

        const entries = Array.from(subMap.entries()),
            uniqueSubcmds = entries.filter(([name, cmd]) => name === cmd.name);

        return new Map(uniqueSubcmds);
    }

    addSubcommand(subcmd) {
        super.addSubcommand(subcmd);

        for (const alias of subcmd.aliases) {
            this.subcmds.set(alias, subcmd);
        }
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

    getHelpText(discord = false) {
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

    getArgsHelp(args, discord = false) {
        const prefix = this.prefix + (this.isSubcmd ? this.parent + " " : "");

        const formattedName = this.isSubcmd && discord ? bold(this.name) : this.name,
            formattedArgs = Util.empty(args) ? "" : " " + (discord ? inlineCode(args) : args);

        return `${prefix}${formattedName}${formattedArgs}`;
    }

    getSubcmdHelp(discord = false) {
        const subcmds = this.getSubcmdList(false);
        return this._formatSubcmdHelp(subcmds, discord);
    }

    async execute(args, ...etc) {
        if (this.isHelpCall(args)) {
            return this.getHelpText();
        }

        if (!this.isSubcmd) {
            const [subName, subArgs] = ParserUtil.splitArgs(args),
                subCmd = this.getSubcmd(subName);

            if (subCmd !== null) {
                return await subCmd.execute(subArgs, ...etc);
            }
        }

        return await super.execute(args, ...etc);
    }

    _formatSubcmdHelp(subcmds, discord) {
        const formattedName = discord ? bold(this.name) : this.name,
            formattedSubcmds = discord ? inlineCode(subcmds) : subcmds;

        return `${this.prefix}${formattedName}${formattedSubcmds}`;
    }
}

export default TextCommand;
