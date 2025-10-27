import { inlineCode } from "discord.js";

import BaseCommandManager from "./BaseCommandManager.js";

import TextCommand from "../../structures/command/TextCommand.js";

import Util from "../../util/Util.js";
import ParserUtil from "../../util/commands/ParserUtil.js";

import categoryNames from "./categoryNames.json" assert { type: "json" };

class TextCommandManager extends BaseCommandManager {
    static commandClass = TextCommand;

    constructor(enabled, commandsDir, commandPrefix, options = {}) {
        super(enabled, commandsDir, options);

        this.commandPrefix = commandPrefix;
    }

    isCommand(str, ...etc) {
        if (str.length <= this.commandPrefix.length) {
            return false;
        }

        return str.startsWith(this.commandPrefix);
    }

    getCommand(str, ...etc) {
        const content = this._getCommandContent(str, ...etc);

        const [name, args] = ParserUtil.splitArgs(content),
            cmd = this.searchCommands(name);

        return [cmd, name, args];
    }

    getHelp(discord = false, indentation = 4, ...etc) {
        const categories = this._categorizeCommands(true, ...etc);

        const headers = this._getCategoryHeaders(categories, discord),
            names = this._getCategoryCmdNames(categories, discord, indentation);

        const format = Array.from(
            {
                length: categories.size
            },
            (_, i) => headers[i] + names[i]
        );

        return format.join("\n\n");
    }

    _getCommandContent(str) {
        return str.slice(this.commandPrefix.length);
    }

    _isInvalidCategory(name) {
        return name === this._commandInvalidValues.category;
    }

    _categorizeCommands(sort, ...etc) {
        const allowedCmds = this.getCommands(...etc),
            categories = new Map();

        for (const command of allowedCmds) {
            const list = categories.get(command.category) ?? [];
            categories.set(command.category, list.concat(command));
        }

        if (!sort) {
            return categories;
        }

        let entries = Array.from(categories.entries());

        entries.sort(([aName], [bName]) => {
            const aInvalid = this._isInvalidCategory(aName),
                bInvalid = this._isInvalidCategory(bName);

            if (aInvalid === bInvalid) {
                return aName.localeCompare(bName);
            } else {
                return aInvalid ? -1 : 1;
            }
        });

        for (const [, cmds] of entries) {
            cmds.sort(({ name: aName }, { name: bName }) =>
                aName.localeCompare(bName, undefined, {
                    numeric: true,
                    sensitivity: "base"
                })
            );
        }

        return new Map(entries);
    }

    _getCategoryHeaders(categories, discord = false) {
        if (!(categories instanceof Map)) {
            const perm = categories;
            categories = this._categorizeCommands(perm, true);
        }

        const headers = Array(categories.size),
            categoryKeys = categories.keys();

        let i = 0,
            num = 1;

        for (const name of categoryKeys) {
            const foundName = categoryNames[name],
                formattedName = Util.nonemptyString(foundName)
                    ? Util.capitalize(foundName)
                    : Util.capitalize(name).replaceAll(/[_-]/g, " ");

            headers[i++] = this._isInvalidCategory(name)
                ? ""
                : `${num++}${discord ? "\\" : ""}. ${formattedName} commands:`;
        }

        return headers;
    }

    _getCategoryCmdNames(categories, discord = false, indentation = 0) {
        if (!(categories instanceof Map)) {
            const perm = categories;
            categories = this._categorizeCommands(perm, true);
        }

        const namesFormat = Array(categories.size),
            categoryEntries = categories.entries();

        const spaces = " ".repeat(indentation);

        let i = 0;

        for (const [name, cmds] of categoryEntries) {
            const cmdNames = cmds.map(cmd => cmd.getName()),
                formattedNames = (discord ? cmdNames.map(n => inlineCode(n)) : cmdNames).join(", ");

            namesFormat[i++] =
                `${this._isInvalidCategory(name) ? "" : `\n${spaces}`}${discord ? "\\" : ""}- ${formattedNames}`;
        }

        return namesFormat;
    }
}

export default TextCommandManager;
