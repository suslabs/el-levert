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
        const content = str.slice(this.commandPrefix.length),
            [name, args] = Util.splitArgs(content);

        const cmd = this.searchCommands(name);
        return [cmd, args];
    }

    isCommand(str) {
        return str.startsWith(this.commandPrefix) && str.length > this.commandPrefix.length;
    }

    getCommands(perm) {
        const commands = this.commands.filter(command => !command.isSubcmd);

        if (typeof perm !== "undefined") {
            const allowedCmds = commands.filter(command => perm >= command.allowed);
            return allowedCmds;
        } else {
            return commands;
        }
    }

    searchCommands(name) {
        const commands = this.getCommands();
        return commands.find(command => command.matches(name));
    }

    getHelp(perm, discord = true) {
        const allowedCmds = this.getCommands(perm),
            cmdNames = allowedCmds.map(command => command.getName());

        cmdNames.sort();

        if (discord) {
            return `\`${cmdNames.join("`, `")}\``;
        } else {
            return cmdNames.join(", ");
        }
    }

    async loadCommands() {
        const loader = new CommandLoader(this.commandsDir, getLogger(), {
            excludeDirs: this.excludeDirs,
            fileExtension: this.cmdFileExtension
        });

        const [commands, status] = await loader.load();

        if (status === LoadStatus.failed) {
            this.commands = [];
        } else {
            this.commands = commands;
            this.bindSubcommands();
        }
    }

    bindSubcommand(command, subcommand) {
        const find = this.commands.find(findCmd => {
            return findCmd.name === subcommand && findCmd.parent === command.name;
        });

        if (typeof find === "undefined") {
            getLogger().warn(`Subcommand "${subcommand}" of command "${command.name}" not found.`);
            return false;
        }

        find.parentCmd = command;
        command.subcmds.set(find.name, find);

        if (find.aliases.length > 0) {
            for (const alias of find.aliases) {
                command.subcmds.set(alias, find);
            }
        }

        return true;
    }

    bindSubcommands() {
        getLogger().info("Loading subcommands...");

        let n = 0;

        this.commands.forEach(command => {
            if (command.isSubcmd || command.subcommands.length < 1) {
                return;
            }

            command.subcommands.forEach(subcommand => {
                const res = this.bindSubcommand(command, subcommand);

                if (res === true) {
                    n++;
                }
            });
        });

        if (n > 0) {
            getLogger().info(`Loaded ${n} subcommands.`);
        }

        return n;
    }

    deleteCommands() {
        getLogger().info("Deleting commands...");

        let i = 0;
        for (; i < this.commands.length; i++) {
            delete this.commands[i];
        }

        while (this.commands.length > 0) {
            this.commands.shift();
        }

        if (i === 0) {
            getLogger().info("No commands were found.");
        } else {
            getLogger().info(`Deleted ${i} commands.`);
        }
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
