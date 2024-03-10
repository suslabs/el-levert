import path from "path";

import Manager from "../Manager.js";
import ManagerError from "../../errors/ManagerError.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import Command from "../../structures/Command.js";

class BaseCommandManager extends Manager {
    constructor(enabled, commandsDir, commandPrefix, options = {}) {
        super(enabled);

        this.commandsDir = commandsDir;
        this.commandPrefix = commandPrefix;

        this.wrapCommands = getClient().config.wrapEvents;

        this.excludeDirs = options.excludeDirs ?? [];
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
            cmdNames = allowedCmds.map(command => {
                const names = [command.name].concat(command.aliases);
                return names.join("/");
            });

        cmdNames.sort();

        if (discord) {
            return `\`${cmdNames.join("`, `")}\``;
        } else {
            return cmdNames.join(", ");
        }
    }

    getCommandPaths() {
        let files;

        try {
            files = Util.getFilesRecSync(this.commandsDir);
        } catch (err) {
            if (err.code === "ENOENT") {
                throw new ManagerError("Couldn't find the commands directory.");
            }

            throw err;
        }

        const excludeDirs = this.excludeDirs.map(dir => path.resolve(dir));

        files = files.filter(file => {
            for (const excludeDir of excludeDirs) {
                if (file.startsWith(excludeDir)) {
                    return false;
                }
            }

            return true;
        });

        files = files.filter(file => {
            const extension = path.extname(file);
            return extension === this.cmdFileExtension;
        });

        return files;
    }

    async loadCommand(commandPath) {
        const cmdProperties = await Util.import(commandPath);

        if (typeof cmdProperties === "undefined") {
            return false;
        }

        const command = new Command(cmdProperties);

        if (typeof command.load !== "undefined") {
            let loadFunc = command.load.bind(command);

            if (this.wrapCommands) {
                loadFunc = getClient().wrapEvent(loadFunc);
            }

            command.load = loadFunc;
            const res = await loadFunc();

            if (res === false) {
                return false;
            }
        }

        const handlerFunc = command.handler.bind(command);
        command.handler = handlerFunc;

        this.commands.push(command);
        return true;
    }

    async loadCommands() {
        getLogger().info("Loading commands...");

        let paths;

        try {
            paths = this.getCommandPaths();
        } catch (err) {
            if (err.name === "ManagerError") {
                getLogger().info(err.message);
                return;
            }

            throw err;
        }

        if (paths.length === 0) {
            getLogger().info("Couldn't find any commands.");
            return;
        }

        let ok = 0,
            bad = 0;

        for (const commandPath of paths) {
            try {
                const res = await this.loadCommand(commandPath);

                if (res === true) {
                    ok++;
                }
            } catch (err) {
                getLogger().error("Error occured while loading command: " + commandPath, err);
                bad++;
            }
        }

        if (ok + bad === 0) {
            getLogger().info("Couldn't load any commands.");
            return;
        }

        getLogger().info(`Loaded ${ok + bad} commands. ${ok} successful, ${bad} failed.`);

        this.loadSubcommands();
    }

    loadSubcommand(command, subcommand) {
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

    loadSubcommands() {
        getLogger().info("Loading subcommands...");

        let n = 0;

        this.commands.forEach(command => {
            if (command.isSubcmd || command.subcommands.length < 1) {
                return;
            }

            command.subcommands.forEach(subcommand => {
                const res = this.loadSubcommand(command, subcommand);

                if (res === true) {
                    n++;
                }
            });
        });

        if (n === 0) {
            getLogger().info("No subcommands were found.");
        } else {
            getLogger().info(`Loaded ${n} subcommands.`);
        }
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
