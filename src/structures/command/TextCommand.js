import { EmbedBuilder, escapeMarkdown, bold, inlineCode } from "discord.js";

import BaseCommand from "./BaseCommand.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import CommandParser from "../../parsers/command/CommandParser.js";
import PositionalCommandReader from "../../parsers/command/reader/PositionalCommandReader.js";

import TextCommandInfo from "./info/TextCommandInfo.js";
import TextCommandContext from "./context/TextCommandContext.js";

class TextCommand extends BaseCommand {
    static infoClass = TextCommandInfo;
    static contextClass = TextCommandContext;

    static {
        this._registerInfoGetters();
    }

    constructor(info) {
        super(info);

        this.parser = new CommandParser(this);
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

        const [firstArg, rest] = PositionalCommandReader.split(context.argsText);

        if (firstArg === "usage") {
            return Util.empty(rest);
        }

        return this.helpArgs.includes(firstArg);
    }

    getHelpText(discord = false) {
        const description = Util.empty(this.description) ? "No description provided." : this.description,
            usage = this.usage ?? "",
            args = this.args ?? "";

        let text = usage;

        if (!Util.empty(args)) {
            const syntax = this.getArgsHelp(args, false);

            if (!usage.includes(syntax) && !usage.includes(args)) {
                text = Util.empty(usage) ? syntax : `${syntax}\n\n${usage}`;
            }
        }

        const usageText = Util.empty(text) ? "No usage provided." : text;

        if (discord) {
            const embed = new EmbedBuilder().addFields(
                {
                    name: "Description",
                    value: description
                },
                {
                    name: "Usage",
                    value: usageText
                }
            );

            return {
                embeds: [embed]
            };
        }

        return `Description:\n${description}\n\nUsage:\n${usageText}`;
    }

    getArgsHelp(args, discord = false) {
        args ??= this.args;

        const prefix = this.prefix + (this.subcommand ? this.parent + " " : "");

        const formattedName = discord ? bold(escapeMarkdown(this.name)) : this.name,
            formattedArgs = Util.empty(args) ? "" : " " + (discord ? inlineCode(args) : args);

        return `${prefix}${formattedName}${formattedArgs}`;
    }

    getSubcmdHelp(discord = false) {
        const subcmds = this.getSubcmdList(false);
        return this._formatSubcmdHelp(subcmds, discord);
    }

    async execute(context) {
        context = this.createContext(context);

        if (!this.subcommand) {
            const [subName, subArgs] = PositionalCommandReader.split(context.argsText),
                subCmd = this.getSubcmd(subName);

            if (subCmd !== null) {
                return await subCmd.execute(
                    context.withArgs(subArgs, {
                        commandName: subName
                    })
                );
            }
        }

        if (this.isHelpCall(context)) {
            return this.getHelpText();
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
