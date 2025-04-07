import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import CommandError from "../../errors/CommandError.js";

class BaseCommand {
    static defaultValues = {
        parent: "",
        subcommands: []
    };

    constructor(options) {
        if (typeof options.name !== "string") {
            throw new CommandError("Command must have a name");
        }

        if (typeof options.handler !== "function") {
            throw new CommandError("Command must have a handler function");
        }

        if (options.subcommand && typeof options.parent !== "string") {
            throw new CommandError("Subcommands must have a parent command");
        }

        this.isSubcmd = options.subcommand ?? false;
        delete options.subcommand;

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        this.subcmds = new Map();
        this.bound = false;
    }

    matches(name) {
        return this.name === name;
    }

    matchesSubcmd(name) {
        return this.getSubcmdNames().includes(name);
    }

    getName(parentSep = ":") {
        return this._getName(this.name, parentSep);
    }

    getSubcmd(name) {
        const subcmds = this.getSubcmdMap();
        return subcmds.get(name) ?? null;
    }

    getSubcmdNames() {
        return this._cmd.subcommands;
    }

    getSubcmds() {
        return Array.from(this.getSubcmdMap().values());
    }

    getSubcmdMap() {
        return this._cmd.subcmds;
    }

    addSubcommand(subcmd) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        if (!this.subcommands.includes(subcmd.name)) {
            this.subcommands.push(subcmd.name);
        }

        this.subcmds.set(subcmd.name, subcmd);
        subcmd.bind(this);
    }

    removeSubcommand(command) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }
    }

    removeSubcommands() {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        ArrayUtil.wipeArray(this.subcommands);
        this.subcmds.clear();
    }

    bind(command) {
        if (!this.isSubcmd) {
            throw new CommandError("Can only bind subcommands");
        }

        this.parentCmd = command;
        this.bound = true;
    }

    async execute(args, context = {}, execCb) {
        if (typeof execCb === "function") {
            const res = await execCb();

            if (typeof res !== "undefined") {
                return res;
            }
        }

        const contextArgs = Object.values(context);
        return await this.handler(args, ...contextArgs);
    }

    get _cmd() {
        return this.isSubcmd ? this.parentCmd : this;
    }

    _getName(name, parentSep) {
        if (parentSep !== false && this.isSubcmd) {
            name = `${this.parentCmd.name}${parentSep} ${name}`;
        }

        return name;
    }
}

export default BaseCommand;
