import Manager from "../Manager.js";

import { getClient, getLogger } from "../../LevertClient.js";

import CommandLoader from "../../loaders/command/CommandLoader.js";
import LoadStatus from "../../loaders/LoadStatus.js";

import Util from "../../util/Util.js";

class BaseCommandManager extends Manager {
    constructor(enabled, commandsDir, commandPrefix, options = {}) {
        super(enabled);

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

        const allowedCmds = commands.filter(command => {
            if (command.ownerOnly) {
                return perm === getClient().permManager.owner.level;
            }

            return perm >= command.allowed;
        });

        return allowedCmds;
    }

    searchCommands(name) {
        const commands = this.getCommands();
        return commands.find(command => command.matches(name));
    }

    getHelp(perm, indentation = 4, discord = true) {
        const allowedCmds = this.getCommands(perm),
            categories = new Map();

        for (const command of allowedCmds) {
            if (!categories.has(command.category)) {
                categories.set(command.category, []);
            }

            const name = command.getName();
            categories.get(command.category).push(name);
        }

        const sortedNames = Array.from(categories.keys()).sort((a, b) => {
            if (a === "none") {
                return -1;
            }

            if (b === "none") {
                return 1;
            }

            return a.localeCompare(b);
        });

        const headers = Array(categories.size),
            spaces = " ".repeat(indentation);

        let num = 1;

        for (const [i, name] of sortedNames.entries()) {
            const formattedName = Util.capitalize(name).replaceAll(/[_-]/, " ");
            let header;

            if (name === "none") {
                header = "";
            } else {
                header = `${num}${discord ? "\\" : ""}. ${formattedName} commands:`;
                num++;
            }

            headers[i] = header;
        }

        const format = Array(categories.size);

        for (const [i, name] of sortedNames.entries()) {
            const cmdNames = categories.get(name);
            cmdNames.sort();

            let categoryFormat = headers[i];

            if (name !== "none") {
                categoryFormat += `\n${spaces}`;
            }

            if (discord) {
                categoryFormat += `\\- \`${cmdNames.join("`, `")}\``;
            } else {
                categoryFormat += `- ${cmdNames.join(", ")}`;
            }

            format[i] = categoryFormat;
        }

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
        getLogger().info(`Bound subcommand "${subcommand.name}" to command "${command.name}".`);

        return true;
    }

    bindSubcommands() {
        getLogger().info("Loading subcommands...");

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
                format = unboundCmds.map(cmd => `    "${cmd.name}" -> "${cmd.parent}"`).join("\n");

            getLogger().warn(`Found ${unbound} unbound subcommand(s):\n${format}`);
        }

        return bound;
    }

    deleteCommands() {
        if (this.commandLoader.loaded) {
            this.commandLoader.deleteCommands();
        } else {
            getLogger().info("No commands to delete.");
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
