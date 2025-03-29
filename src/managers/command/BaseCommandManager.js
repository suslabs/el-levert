import Manager from "../Manager.js";

import BaseCommand from "../../structures/command/Command.js";
import CommandLoader from "../../loaders/command/CommandLoader.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import LoadStatus from "../../loaders/LoadStatus.js";

import CommandError from "../../errors/CommandError.js";

class BaseCommandManager extends Manager {
    static commandClass = BaseCommand;

    constructor(enabled, commandsDir, commandPrefix, options = {}) {
        super(enabled, options);

        this.commandsDir = commandsDir;
        this.commandPrefix = commandPrefix;

        this.wrapCommands = options.wrapCommands ?? getClient().config.wrapEvents;
        this.excludeDirs = options.excludeDirs;
        this.cmdFileExtension = options.cmdFileExtension ?? ".js";

        this.commands = [];
    }

    getCommands() {
        return this.commands.filter(command => !command.isSubcmd);
    }

    searchCommands(name) {
        const commands = this.getCommands(),
            command = commands.find(command => command.matches(name));

        return command ?? null;
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

    deleteCommands() {
        if (this._commandLoader.loaded) {
            this._commandLoader._deleteCommands();
        } else {
            getLogger().debug("No commands to delete.");
        }

        delete this._commandLoader;
    }

    deleteCommand(command, removeSubcommands = true, errorIfNotFound = false) {
        if (command.isSubcmd) {
            throw new CommandError("Can only delete parent commands");
        }

        let deleted = Util.removeItem(this.commands, command);

        if (errorIfNotFound && !deleted) {
            throw new CommandError(`Couldn't delete command ${command.name}`);
        }

        this._commandLoader.deleteData(command, errorIfNotFound);

        if (!removeSubcommands) {
            return deleted;
        }

        if (Util.empty(command.subcmds)) {
            return deleted;
        }

        this.deleteSubcommands(command, errorIfNotFound);
        return deleted;
    }

    deleteSubcommands(command, errorIfNotFound = false) {
        if (Util.empty(command.subcmds)) {
            if (errorIfNotFound) {
                throw new CommandError("Command has no subcommands");
            }

            return false;
        }

        let deleted = true;

        for (const subcmd of command.getSubcmds()) {
            deleted &= Util.removeItem(this.commands, subcmd);

            if (errorIfNotFound && !deleted) {
                throw new CommandError(`Couldn't delete subcommand ${subcmd.name} of command ${command.name}`);
            }

            this._commandLoader.deleteData(subcmd, errorIfNotFound);
        }

        command.removeSubcommands();
        return deleted;
    }

    deleteSubcommand(subcmd, parent, errorIfNotFound = false) {
        if (!subcmd.isSubcmd) {
            throw new CommandError("Can only delete subcommands");
        }

        parent = subcmd.parentCmd ?? parent;
        const hasParent = parent != null;

        const deleted = Util.removeItem(this.commands, subcmd);

        if (errorIfNotFound && !deleted) {
            const name = subcmd.name + hasParent ? ` of command ${parent.name}` : "";
            throw new CommandError(`Couldn't delete subcommand ${name}.`);
        }

        if (!hasParent) {
            return deleted;
        }

        parent.removeSubcommand(subcmd);
        return deleted;
    }

    async reloadCommands() {
        getLogger().info("Reloading commands...");

        this.deleteCommands();
        await this._loadCommands();
    }

    async load() {
        await this._loadCommands();
    }

    unload() {
        this.deleteCommands();
    }

    get _commandDefaults() {
        return this.constructor.commandClass.defaultValues;
    }

    _bindSubcommands() {
        getLogger().debug("Loading subcommands...");

        let total = 0,
            bound = 0;

        for (const command of this.commands) {
            total += +command.isSubcmd;

            if (command.isSubcmd || Util.empty(command.subcommands)) {
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

            getLogger().warn(`Found ${unbound} orphaned subcommand(s):\n${format}`);

            Util.wipeArray(unboundCmds, command => {
                this.deleteSubcommand(command);
            });
        }

        return bound;
    }

    _findDuplicateCommands() {
        const commands = this.getCommands(),
            duplicates = [];

        for (const [i, command] of commands.entries()) {
            const previous = commands.slice(0, i);

            const duplicate = previous.findLast(cmd => {
                if (cmd.name === command.name) {
                    return true;
                }

                return cmd.aliases.includes(command.name);
            });

            if (typeof duplicate === "undefined") {
                continue;
            }

            const duplicatePath = this._commandLoader.getPath(duplicate);
            getLogger().warn(`Duplicate command of "${command.name}" found: ${duplicatePath}`);

            duplicates.push(duplicate);
        }

        return duplicates;
    }

    _deleteDuplicateCommands() {
        const duplicates = this._findDuplicateCommands();

        Util.wipeArray(duplicates, command => {
            this.deleteCommand(command, false);
            getLogger().info(`Deleted duplicate of "${command.name}".`);
        });
    }

    async _loadCommands() {
        const commandLoader = new CommandLoader(this.commandsDir, getLogger(), {
            excludeDirs: this.excludeDirs,
            fileExtension: this.cmdFileExtension,

            commandClass: this.constructor.commandClass,
            extraOptions: {
                prefix: this.commandPrefix
            }
        });

        this._commandLoader = commandLoader;
        const [commands, status] = await commandLoader.load();

        if (status === LoadStatus.failed) {
            return;
        }

        this.commands = commands;

        this._deleteDuplicateCommands();
        this._bindSubcommands();
    }
}

export default BaseCommandManager;
