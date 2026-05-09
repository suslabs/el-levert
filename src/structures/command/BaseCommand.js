import BaseCommandInfo from "./info/BaseCommandInfo.js";
import BaseCommandContext from "./context/BaseCommandContext.js";

import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import CommandError from "../../errors/CommandError.js";

class BaseCommand {
    static infoClass = BaseCommandInfo;
    static contextClass = BaseCommandContext;

    static get defaultValues() {
        return this.infoClass.defaultValues;
    }

    static get invalidValues() {
        return this.infoClass.invalidValues;
    }

    static {
        this._registerInfoGetters();
    }

    constructor(info = {}) {
        this.info = new this.constructor.infoClass(info);

        if (typeof this.handler !== "function") {
            throw new CommandError("Command must have a handler function");
        }

        this.subcmds = new Map();
        this.bound = false;
    }

    createContext(data = {}) {
        if (data instanceof this.constructor.contextClass) {
            return data.command === this
                ? data
                : data.clone({
                      command: this,
                      _parsedArgs: undefined
                  });
        }

        return new this.constructor.contextClass({
            ...data,
            command: this
        });
    }

    getData(prefix = "", nullable = true, props = null) {
        const infoData = this.info.toObject();

        const keys =
            props ??
            Array.from(
                new Set([
                    ...Object.keys(infoData),
                    ...Object.keys(this).filter(key => !key.startsWith("_") && key !== "info")
                ])
            );

        const data = Object.fromEntries(keys.map(key => [key, key in infoData ? infoData[key] : this[key]]));

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(
                prop => props == null || props.includes(prop)
            )) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
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
        if (this.subcommand) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        if (!this.subcommands.includes(subcmd.name)) {
            this.subcommands.push(subcmd.name);
        }

        subcmd.bind(this);
        this.subcmds.set(subcmd.name, subcmd);
    }

    removeSubcommand(subcmd) {
        if (this.subcommand) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        ArrayUtil.removeItem(this.subcommands, subcmd.name);
        this.subcmds.delete(subcmd.name);
    }

    removeSubcommands() {
        if (this.subcommand) {
            throw new CommandError("Only parent commands can have subcommands");
        }

        ArrayUtil.wipeArray(this.subcommands);
        this.subcmds.clear();
    }

    bind(command) {
        if (!this.subcommand) {
            throw new CommandError("Can only bind subcommands");
        }

        this.parentCmd = command;
        this.bound = true;
    }

    async execute(context) {
        return await this.handler(this.createContext(context));
    }

    subcmdOf(parent, subName) {
        return this.subcommand && this.parent === parent.name && this.name === subName;
    }

    equivalent(cmd) {
        return this.matches(cmd.name) && this._sameParent(cmd);
    }

    equals(cmd) {
        return this.name === cmd.name && this._sameParent(cmd);
    }

    static _nullableDataProps = [];

    static _infoGetter(prop) {
        return {
            propName: prop,
            desc: {
                get() {
                    return this.info[prop];
                }
            }
        };
    }

    static _registerFunc(factory, ...args) {
        ObjectUtil.defineProperty(this.prototype, factory, ...args);
    }

    static _registerInfoGetters() {
        for (const prop of this.infoClass.dataProps) {
            if (Object.getOwnPropertyDescriptor(this.prototype, prop) == null) {
                this._registerFunc(this._infoGetter, prop);
            }
        }
    }

    get _cmd() {
        return this.subcommand ? this.parentCmd : this;
    }

    _getName(name, full = false, parentSep = ":") {
        const includeParent = this.subcommand && parentSep !== false,
            parentName = this.parentCmd?.name ?? this.parent;

        if (full) {
            const prefix = this.subcommand ? "sub" : "",
                parentFormat = includeParent ? ` of parent command "${parentName}"` : "";

            return `${prefix}command "${name}"${parentFormat}`;
        } else {
            const parentFormat = includeParent ? `${parentName}${parentSep}` : "";
            return parentFormat + name;
        }
    }

    _sameParent(cmd) {
        return this.subcommand === cmd.subcommand && this.parent === cmd.parent;
    }
}

export default BaseCommand;
