import { escapeMarkdown, bold, inlineCode, codeBlock } from "discord.js";

import BaseCommand from "./BaseCommand.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import TextCommandInfo from "./info/TextCommandInfo.js";
import TextCommandContext from "./context/TextCommandContext.js";

class TextCommand extends BaseCommand {
    static infoClass = TextCommandInfo;
    static contextClass = TextCommandContext;

    static {
        this._registerInfoGetters();
    }

    get hasHelp() {
        return !Util.empty(this.description) || !Util.empty(this.usage);
    }

    matches(name, checkAliases = true) {
        return super.matches(name) || (checkAliases && this.aliases.includes(name));
    }

    matchesSubcmd(name, checkAliases = true) {
        return this.getSubcmdNames(checkAliases).includes(name);
    }

    getName(full, parentSep, aliasSep = "/") {
        let name = this.name;

        if (aliasSep !== false && !Util.empty(this.aliases)) {
            const names = [name].concat(this.aliases);
            name = names.join(aliasSep);
        }

        return super._getName(name, full, parentSep);
    }

    getSubcmd(name, includeAliases = true) {
        const subcmds = this.getSubcmdMap(includeAliases);
        return subcmds.get(name) ?? null;
    }

    getSubcmdNames(includeAliases = true) {
        return includeAliases ? Array.from(super.getSubcmdMap().keys()) : super.getSubcmdNames();
    }

    getSubcmds() {
        return Array.from(this.getSubcmdMap(false).values());
    }

    getSubcmdList(includeAliases = true, sep = "|") {
        if (this.subcommand) {
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

    removeSubcommand(subcmd) {
        super.removeSubcommand(subcmd);

        for (const alias of subcmd.aliases) {
            this.subcmds.delete(alias);
        }
    }

    isHelpCall(context) {
        if (!this.hasHelp) {
            return false;
        }

        return context.argsText.split(" ").some(part => this.helpArgs.includes(part));
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
        const prefix = this.prefix + (this.subcommand ? this.parent + " " : "");

        const formattedName = discord ? bold(escapeMarkdown(this.name)) : this.name,
            formattedArgs = Util.empty(args) ? "" : " " + (discord ? inlineCode(args) : args);

        return `${prefix}${formattedName}${formattedArgs}`;
    }

    getSubcmdHelp(discord = false) {
        const subcmds = this.getSubcmdList(false);
        return this._formatSubcmdHelp(subcmds, discord);
    }

    createContext(data = {}) {
        const context = super.createContext(data);
        return context instanceof TextCommandContext ? context : new this.constructor.contextClass(context);
    }

    async execute(context) {
        context = this.createContext(context);

        if (this.isHelpCall(context)) {
            return this.getHelpText();
        }

        if (!this.subcommand) {
            const [subName, subArgs] = context.splitArgs(),
                subCmd = this.getSubcmd(subName);

            if (subCmd !== null) {
                return await subCmd.execute(
                    context.withArgs(subArgs, {
                        commandName: subName
                    })
                );
            }
        }

        return await super.execute(context);
    }

    equals(cmd) {
        return super.equals(cmd) && ArrayUtil.sameElements(this.aliases, cmd.aliases, false);
    }

    _formatSubcmdHelp(subcmds, discord) {
        const formattedName = discord ? bold(escapeMarkdown(this.name)) : this.name,
            formattedSubcmds = discord ? inlineCode(subcmds) : subcmds;

        return `${this.prefix}${formattedName} ${formattedSubcmds}`;
    }
}

export default TextCommand;
