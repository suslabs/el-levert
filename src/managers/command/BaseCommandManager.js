import URL from "url";

import Manager from "../Manager.js";

import { getLogger } from "../../LevertClient.js";
import wrapEvent from "../../client/wrapEvent.js";
import Util from "../../util/Util.js";

import Command from "../../structures/Command.js";

class BaseCommandManager extends Manager {
    constructor(enabled, commandsDir, commandPrefix) {
        super(enabled);

        this.commandsDir = commandsDir;
        this.commandPrefix = commandPrefix;

        this.commands = [];
    }

    getCommand(str) {
        const content = str.slice(this.commandPrefix.length),
            [name, args] = Util.splitArgs(content);

        const cmd = this.searchCommands(name);
        return [cmd, args];
    }

    isCommand(str) {
        return str.startsWith(this.commandPrefix);
    }

    searchCommands(name) {
        return this.commands.find(command => {
            if (command.isSubcmd) {
                return false;
            }

            if (command.name === name) {
                return true;
            }

            if (command.aliases.length > 0) {
                return command.aliases.includes(name);
            }
        });
    }

    async loadCommands() {
        getLogger().info("Loading commands...");

        let paths = Util.getFilesRecSync(this.commandsDir);
        paths = paths.filter(file => file.endsWith(".js"));

        if (paths.length === 0) {
            getLogger().info("Couldn't find any commands.");
            return;
        }

        let ok = 0,
            bad = 0;

        for (const path of paths) {
            try {
                if (await this.loadCommand(path)) {
                    ok++;
                }
            } catch (err) {
                getLogger().error("Error occured while loading command: " + path, err);
                bad++;
            }
        }

        getLogger().info(`Loaded ${ok + bad} commands. ${ok} successful, ${bad} failed.`);
    }

    async loadCommand(commandPath) {
        commandPath = URL.pathToFileURL(commandPath);
        const cmdProperties = (await import(commandPath)).default;

        if (typeof cmdProperties === "undefined" || typeof cmdProperties.name === "undefined") {
            return false;
        }

        const command = new Command(cmdProperties);

        if (typeof command.load !== "undefined") {
            command.load = wrapEvent(getLogger(), command.load.bind(command));
            const res = command.load();

            if (res === false) {
                return false;
            }
        }

        command.handler = command.handler.bind(command);
        this.commands.push(command);

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
                const find = this.commands.find(findCmd => {
                    return findCmd.name === subcommand && findCmd.parent === command.name;
                });

                if (typeof find === "undefined") {
                    getLogger().warn(`Subcommand "${subcommand}" of command "${command.name}" not found.`);
                    return;
                }

                find.parentCmd = command;
                command.subcmds.set(find.name, find);

                n++;
            });
        });

        if (n === 0) {
            getLogger().info("No subcommands were found.");
        } else {
            getLogger().info(`Loaded ${n} subcommands.`);
        }
    }

    async load() {
        await this.loadCommands();
        this.bindSubcommands();
    }
}

export default BaseCommandManager;
