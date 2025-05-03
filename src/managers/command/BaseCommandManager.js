import Manager from "../Manager.js";

import BaseCommand from "../../structures/command/Command.js";
import CommandLoader from "../../loaders/command/CommandLoader.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import LoadStatus from "../../loaders/LoadStatus.js";

import CommandError from "../../errors/CommandError.js";

class BaseCommandManager extends Manager {
    static commandClass = BaseCommand;

    constructor(enabled, commandsDir, options = {}) {
        super(enabled, options);

        this.commandsDir = commandsDir;

        this.wrapCommands = options.wrapCommands ?? getClient().config.wrapEvents;
        this.excludeDirs = options.excludeDirs;
        this.cmdFileExtension = options.cmdFileExtension ?? ".js";

        this.commands = [];
    }

    getCommands(includeSubcommands = false) {
        if (includeSubcommands) {
            return this.commands;
        } else {
            return this.commands.filter(command => !command.isSubcmd);
        }
    }

    searchCommands(name) {
        const commands = this.getCommands(),
            command = commands.find(command => command.matches(name));

        return command ?? null;
    }

    bindSubcommand(command, subName) {
        const subcmd = this.commands.find(cmd => cmd.subcmdOf(command, subName));

        if (typeof subcmd === "undefined") {
            getLogger().warn(`Subcommand "${subName}" of command "${command.name}" not found.`);
            return false;
        }

        command.addSubcommand(subcmd);
        getLogger().debug(`Bound subcommand "${subcmd.name}" to command "${command.name}".`);

        return true;
    }

    deleteCommands() {
        let n = 0;

        if (this._commandLoader.loaded) {
            n = this._commandLoader.deleteCommands();
        } else {
            getLogger().debug("No commands to delete.");
        }

        delete this._commandLoader;
        return n;
    }

    deleteCommand(command, removeSubcommands = true, errorIfNotFound = false) {
        if (command.isSubcmd) {
            throw new CommandError("Can only delete parent commands");
        }

        let [deleted] = ArrayUtil.removeItem(this.commands, command);

        if (errorIfNotFound && !deleted) {
            throw new CommandError(`Couldn't delete ${command.getName(true)}`);
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
            deleted &= ArrayUtil.removeItem(this.commands, subcmd)[0];

            if (errorIfNotFound && !deleted) {
                throw new CommandError(`Couldn't delete ${subcmd.getName(true)}`);
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

        parent ??= subcmd.parentCmd;
        const [deleted] = ArrayUtil.removeItem(this.commands, subcmd);

        if (errorIfNotFound && !deleted) {
            throw new CommandError(`Couldn't delete ${subcmd.getName(true)}`);
        }

        if (parent != null) {
            parent.removeSubcommand(subcmd);
        }

        return deleted;
    }

    async reloadCommands() {
        getLogger().info("Reloading commands...");

        this.deleteCommands();
        return await this._loadCommands();
    }

    async load() {
        return await this._loadCommands();
    }

    unload() {
        return this.deleteCommands();
    }

    get _commandDefaultValues() {
        return this.constructor.commandClass.defaultValues;
    }

    get _commandInvalidValues() {
        return this.constructor.commandClass.invalidValues;
    }

    _bindSubcommands() {
        getLogger().info("Loading subcommands...");

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

        if (total < 1) {
            getLogger().info("No subcommands were found.");
        } else if (bound > 0) {
            getLogger().info(`Loaded ${bound} subcommand(s).`);
        } else {
            getLogger().info("No subcommands were loaded.");
        }

        const unbound = total - bound;

        if (unbound > 0) {
            const unboundCmds = this.commands.filter(cmd => cmd.isSubcmd && !cmd.bound),
                format = unboundCmds.map((cmd, i) => `${i + 1}. "${cmd.getName(false, '" -> "')}"`).join("\n");

            getLogger().warn(`Found ${unbound} orphaned subcommand(s):\n${format}`);

            ArrayUtil.wipeArray(unboundCmds, command => {
                this.deleteSubcommand(command);
            });
        }

        return bound;
    }

    _findDuplicateCommands() {
        return this.commands
            .map((command, i) => {
                const previous = this.commands.slice(0, i),
                    duplicate = previous.findLast(other => command.equivalent(other));

                if (typeof duplicate === "undefined") {
                    return duplicate;
                }

                const duplicatePath = this._commandLoader.getPath(duplicate);
                getLogger().warn(`Duplicate command of "${command.getName()}" found: ${duplicatePath}`);

                return duplicate;
            })
            .filter(Boolean);
    }

    _deleteDuplicateCommands() {
        const duplicates = this._findDuplicateCommands();

        ArrayUtil.wipeArray(duplicates, command => {
            if (command.isSubcmd) {
                this.deleteSubcommand(command);
            } else {
                this.deleteCommand(command, false);
            }

            getLogger().info(`Deleted duplicate of "${command.getName()}".`);
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

        return commandLoader.result;
    }
}

export default BaseCommandManager;
