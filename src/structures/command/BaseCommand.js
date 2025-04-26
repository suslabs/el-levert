import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import CommandError from "../../errors/CommandError.js";

class BaseCommand {
    static invalidValues = {};

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

        this.isSubcmd = options.subcommand ?? false;
        delete options.subcommand;

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        if (this.isSubcmd && Util.empty(this.parent)) {
            throw new CommandError("Subcommands must have a parent command");
        }

        this.subcmds = new Map();
        this.bound = false;
    }

    matches(name) {
        return this.name === name;
    }

    matchesSubcmd(name) {
        return this.getSubcmdNames().includes(name);
    }

    getName(full, parentSep) {
        return this._getName(this.name, full, parentSep);
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

        subcmd.bind(this);
        this.subcmds.set(subcmd.name, subcmd);
    }

    removeSubcommand(subcmd) {
        if (this.isSubcmd) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        ArrayUtil.removeItem(this.subcommands, subcmd.name);
        this.subcmds.delete(subcmd.name);
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

    subcmdOf(parent, subName) {
        return this.isSubcmd && this.parent === parent.name && this.name === subName;
    }

    equivalent(cmd) {
        return this.matches(cmd.name) && this._sameParent(cmd);
    }

    equals(cmd) {
        return this.name === cmd.name && this._sameParent(cmd);
    }

    get _cmd() {
        return this.isSubcmd ? this.parentCmd : this;
    }

    _getName(name, full = false, parentSep = ":") {
        const includeParent = this.isSubcmd && parentSep !== false,
            parentName = this.parentCmd?.name ?? this.parent;

        if (full) {
            const prefix = this.isSubcmd ? "sub" : "",
                parentFormat = includeParent ? ` of parent command "${parentName}"` : "";

            return `${prefix}command "${name}"${parentFormat}`;
        } else {
            const parentFormat = includeParent ? `${parentName}${parentSep}` : "";
            return parentFormat + name;
        }
    }

    _sameParent(cmd) {
        return this.isSubcmd === cmd.isSubcmd && this.parent === cmd.parent;
    }
}

export default BaseCommand;
