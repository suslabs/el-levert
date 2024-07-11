import Manager from "../Manager.js";
import Command from "../../structures/Command.js";

import CommandLoader from "../../loaders/command/CommandLoader.js";
import LoadStatus from "../../loaders/LoadStatus.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import categoryNames from "./categoryNames.json" assert { type: "json" };

class BaseCommandManager extends Manager {
    constructor(enabled, commandsDir, commandPrefix, options = {}) {
        super(enabled, options);

        this.commandsDir = commandsDir;
        this.commandPrefix = commandPrefix;

        this.wrapCommands = options.wrapCommands ?? getClient().config.wrapEvents;
        this.excludeDirs = options.excludeDirs;
        this.cmdFileExtension = options.cmdFileExtension ?? ".js";

        this.commands = [];
    }

    getCommand(str) {
        const content = str.substring(this.commandPrefix.length),
            [name, args] = Util.splitArgs(content);

        const cmd = this.searchCommands(name);
        return [cmd, args];
    }

    isCommand(str) {
        return str.startsWith(this.commandPrefix) && str.length > this.commandPrefix.length;
    }

    getCommands(perm) {
        const commands = this.commands.filter(command => !command.isSubcmd);

        if (typeof perm === "undefined") {
            return commands;
        }

        const allowedCmds = commands.filter(command => command.canExecute(perm));
        return allowedCmds;
    }

    searchCommands(name) {
        const commands = this.getCommands();
        return commands.find(command => command.matches(name));
    }

    categorizeCommands(perm, sort = false) {
        const allowedCmds = this.getCommands(perm),
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

            if (aName === Command.defaultValues.category) {
                return -1;
            }

            if (bName === Command.defaultValues.category) {
                return 1;
            }

            return aName.localeCompare(bName);
        });

        for (const [_, cmds] of entries) {
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

    getCategoryHeaders(categories, discord = false) {
        if (!(categories instanceof Map)) {
            const perm = categories;
            categories = this.categorizeCommands(perm, true);
        }

        const headers = Array(categories.size),
            categoryNames = categories.keys();

        let i = 0,
            num = 1;

        for (const name of categoryNames) {
            let formattedName = categoryNames[name],
                header;

            if (typeof formattedName === "undefined") {
                formattedName = Util.capitalize(name).replaceAll(/[_-]/g, " ");
            } else {
                formattedName = Util.capitalize(formattedName);
            }

            if (name === Command.defaultValues.category) {
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

    getCategoryCmdNames(categories, discord = false, indentation = 0) {
        if (!(categories instanceof Map)) {
            const perm = categories;
            categories = this.categorizeCommands(perm, true);
        }

        const namesFormat = Array(categories.size),
            categoryEntries = categories.entries();

        const spaces = " ".repeat(indentation);

        let i = 0;

        for (const [name, cmds] of categoryEntries) {
            const cmdNames = cmds.map(cmd => cmd.getName());

            let categoryFormat = "";

            if (name !== Command.defaultValues.category) {
                categoryFormat = `\n${spaces}`;
            }

            if (discord) {
                const names = `\`${cmdNames.join("`, `")}\``;
                categoryFormat += "\\- " + names;
            } else {
                const names = cmdNames.join(", ");
                categoryFormat += "- " + names;
            }

            namesFormat[i] = categoryFormat;
            i++;
        }

        return namesFormat;
    }

    getHelp(perm, discord = true, indentation = 4) {
        const categories = this.categorizeCommands(perm, true);

        const headers = this.getCategoryHeaders(categories, discord),
            names = this.getCategoryCmdNames(categories, discord, indentation);

        const format = Array.from(
            {
                length: categories.size
            },
            (_, i) => headers[i] + names[i]
        );

        return format.join("\n\n");
    }

    async loadCommands() {
        const commandLoader = new CommandLoader(this.commandsDir, getLogger(), {
            excludeDirs: this.excludeDirs,
            fileExtension: this.cmdFileExtension
        });

        const [commands, status] = await commandLoader.load();

        if (status !== LoadStatus.failed) {
            this.commands = commands;
            this.bindSubcommands();
        }

        this.commandLoader = commandLoader;
    }

    bindSubcommand(command, subName) {
        const subcommand = this.commands.find(cmd => {
            return cmd.name === subName && cmd.parent === command.name;
        });

        if (typeof subcommand === "undefined") {
            getLogger().warn(`Subcommand "${subName}" of command "${command.name}" not found.`);
            return false;
        }

        command.addSubcommand(subcommand);
        getLogger().debug(`Bound subcommand "${subcommand.name}" to command "${command.name}".`);

        return true;
    }

    bindSubcommands() {
        getLogger().debug("Loading subcommands...");

        let total = 0,
            bound = 0;

        for (const command of this.commands) {
            total += +command.isSubcmd;

            if (command.isSubcmd || command.subcommands.length < 1) {
                continue;
            }

            for (const subName of command.subcommands) {
                const res = this.bindSubcommand(command, subName);

                if (res === true) {
                    bound++;
                }
            }
        }

        if (bound > 0) {
            getLogger().info(`Loaded ${bound} subcommand(s).`);
        }

        const unbound = total - bound;

        if (unbound > 0) {
            const unboundCmds = this.commands.filter(cmd => cmd.isSubcmd && !cmd.bound),
                format = unboundCmds.map((cmd, i) => `${i + 1}. "${cmd.name}" -> "${cmd.parent}"`).join("\n");

            getLogger().warn(`Found ${unbound} unbound subcommand(s):\n${format}`);
        }

        return bound;
    }

    deleteCommands() {
        if (this.commandLoader.loaded) {
            this.commandLoader.deleteCommands();
        } else {
            getLogger().debug("No commands to delete.");
        }

        delete this.commandLoader;
    }

    async reloadCommands() {
        getLogger().info("Reloading commands...");

        this.deleteCommands();
        await this.loadCommands();
    }

    async load() {
        await this.loadCommands();
    }

    unload() {
        this.deleteCommands();
    }
}

export default BaseCommandManager;
