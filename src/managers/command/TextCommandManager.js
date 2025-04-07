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

    _categorizeCommands(sort, ...etc) {
        const allowedCmds = this.getCommands(...etc),
            categories = new Map();

        for (const command of allowedCmds) {
            if (!categories.has(command.category)) {
                categories.set(command.category, []);
            }

            const category = categories.get(command.category);
            category.push(command);
        }

        if (!sort) {
            return categories;
        }

        let entries = Array.from(categories.entries());

        entries.sort((a, b) => {
            const aName = a[0],
                bName = b[0];

            if (aName === this._commandDefaults.category) {
                return -1;
            }

            if (bName === this._commandDefaults.category) {
                return 1;
            }

            return aName.localeCompare(bName);
        });

        for (const [, cmds] of entries) {
            cmds.sort((a, b) => {
                const aName = a.name,
                    bName = b.name;

                return aName.localeCompare(bName, undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
            });
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
            let formattedName = categoryNames[name],
                header;

            if (typeof formattedName === "undefined") {
                formattedName = Util.capitalize(name).replaceAll(/[_-]/g, " ");
            } else {
                formattedName = Util.capitalize(formattedName);
            }

            if (name === this._commandDefaults.category) {
                header = "";
            } else {
                header = `${num}${discord ? "\\" : ""}. ${formattedName} commands:`;
                num++;
            }

            headers[i] = header;
            i++;
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
            const cmdNames = cmds.map(cmd => cmd.getName());

            let categoryFormat = "";

            if (name !== this._commandDefaults.category) {
                categoryFormat = `\n${spaces}`;
            }

            if (discord) {
                const names = `\`${cmdNames.join("`, `")}\``;
                categoryFormat += `\\- ${names}`;
            } else {
                const names = cmdNames.join(", ");
                categoryFormat += `- ${names}`;
            }

            namesFormat[i] = categoryFormat;
            i++;
        }

        return namesFormat;
    }
}

export default TextCommandManager;
