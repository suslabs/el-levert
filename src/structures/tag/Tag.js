import { bold } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import { isObject } from "../../util/misc/TypeTester.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

import TagError from "../../errors/TagError.js";

class Tag {
    static defaultValues = {
        hops: [],
        name: "",
        body: "",
        owner: "0",
        args: "",
        type: TagTypes.defaultType
    };

    static getFlag(names = []) {
        if (!Array.isArray(names)) {
            names = [names];
        }

        return names.reduce((flag, name) => flag | Tag._getFlag(name, false), 0);
    }

    constructor(data) {
        if (typeof data?.hops === "string") {
            data.hops = data.hops.split(Tag._hopsSeparator);
        }

        Util.setValuesWithDefaults(this, data, Tag.defaultValues);

        if (Util.empty(this.hops)) {
            this.hops.push(this.name);
        } else if (this.isAlias) {
            this.body = Tag.defaultValues.body;
        }

        if (typeof this.type === "string") {
            this.setType(this.type);
        }

        this._fetched = false;
    }

    get isAlias() {
        return Util.multiple(this.hops);
    }

    get aliasName() {
        if (!this.isAlias) {
            return "";
        }

        return this.hops[1];
    }

    getHopsString() {
        return this.hops.join(Tag._hopsSeparator);
    }

    setName(name) {
        name ??= Tag.defaultValues.name;

        this.name = name;
        this.hops[0] = name;
    }

    setOwner(owner) {
        this.owner = owner ?? Tag.defaultValues.owner;
    }

    setBody(body, type) {
        this.body = body ?? Tag.defaultValues.body;

        if (type != null) {
            this.setType(type);
        }
    }

    setAliasProps(hops, args) {
        this.hops = hops ?? Tag.defaultValues.hops;
        this.args = args ?? Tag.defaultValues.args;

        this._fetched = true;
    }

    hasFlag(name) {
        const flag = Tag._getFlag(name);
        return (this.type & flag) === flag;
    }

    setFlag(name, value = true) {
        const flag = Tag._getFlag(name);

        if (value) {
            this.type |= flag;
        } else {
            this.type &= ~flag;
        }

        return this.type;
    }

    getVersion() {
        for (const version of TagTypes.versionTypes) {
            const propName = `is${Util.capitalize(version)}`;

            if (this[propName]) {
                return version;
            }
        }
    }

    setVersion(version) {
        if (typeof version !== "string" || Util.empty(version)) {
            throw new TagError("Invalid version");
        }

        if (!TagTypes.versionTypes.includes(version)) {
            throw new TagError("Unknown version: " + version);
        }

        return this._setVersion(version);
    }

    getType() {
        if (!this.isScript) {
            return TagTypes.textType;
        }

        for (const type of TagTypes.specialScriptTypes) {
            if (this.hasFlag(type)) {
                return type;
            }
        }

        return TagTypes.defaultScriptType;
    }

    setType(type) {
        let version;

        if (Array.isArray(type)) {
            if (type.length > 2) {
                throw new TagError("Invalid type");
            }

            [type, version] = type;
        } else if (TagTypes.versionTypes.includes(type)) {
            version = type;
            type = TagTypes.defaultType;
        } else {
            version = TagTypes.defaultVersion;
        }

        let newType = this._setVersion(version),
            typeSet = false;

        if (typeof type !== "string" || Util.empty(type)) {
            throw new TagError("Invalid type");
        }

        if (type === TagTypes.textType) {
            return this.type;
        }

        if (TagTypes.scriptTypes.includes(type)) {
            newType |= TagFlags.script;
            typeSet = true;
        }

        if (TagTypes.specialScriptTypes.includes(type)) {
            newType |= TagFlags[type];
            typeSet = true;
        }

        if (!typeSet) {
            throw new TagError("Unknown type: " + type);
        }

        this.type = newType;
        return newType;
    }

    getData() {
        const allowed = Object.entries(this).filter(([key]) => !key.startsWith("_"));
        return Object.fromEntries(allowed);
    }

    getSize() {
        const bodySize = Util.getUtf8ByteLength(this.body),
            argsSize = Util.getUtf8ByteLength(this.args);

        const totalSize = bodySize + argsSize;
        return totalSize / 1024;
    }

    format() {
        let format = this.name;

        if (this.isAlias) {
            format += ` (-> ${this.aliasName}`;

            if (!Util.empty(this.args)) {
                format += `: ${this.args}`;
            }

            format += ")";
        }

        return format;
    }

    sameBody(tag) {
        return this.body === tag.body && this.args === tag.args;
    }

    sameType(tag) {
        return this.type === tag.type && this.isAlias === tag.isAlias;
    }

    sameHops(tag) {
        if (this.hops.length !== tag.hops.length) {
            return false;
        }

        return this.hops.every((hop, i) => tag.hops[i] === hop);
    }

    isEquivalent(tag) {
        return this.sameBody(tag) && this.sameType(tag);
    }

    isEqual(tag) {
        return this.isEquivalent(tag) && this.sameHops(tag);
    }

    getRaw(discord = false) {
        const body = this.body.trim(),
            args = this.args.trim();

        if (this.isScript) {
            const formattedType = discord ? bold(this.getType()) : this.getType(),
                header = `Script type is ${formattedType}`;

            if (discord) {
                return {
                    content: header,
                    ...Util.getFileAttach(body, "script.js")
                };
            }

            return `${header}\n---\n${body}\n---`;
        }

        if (this.isAlias) {
            const formattedName = discord ? bold(this.name) : this.name,
                formattedAliasName = discord ? bold(this.aliasName) : this.aliasName,
                header = `${formattedName} is an alias of ${formattedAliasName}`;

            let out = header;

            if (!Util.empty(this.args)) {
                out += ` (with args: `;

                if (discord) {
                    out += ")";

                    return {
                        content: out,
                        ...Util.getFileAttach(args, "args.txt")
                    };
                }

                out += `${this.args})`;
            }

            if (discord) {
                return {
                    content: out
                };
            }

            return out;
        }

        if (discord) {
            return Util.getFileAttach(body, "tag.txt");
        }

        return body;
    }

    async getInfo(raw = false, bodyLimit = 300) {
        if (raw) {
            return this.getData();
        }

        const aliasName = this.isAlias ? this.aliasName : "none",
            body = Util.empty(this.body) ? "empty" : Util.trimString(this.body, bodyLimit, null, true),
            args = Util.empty(this.args) ? "none" : Util.trimString(this.args, bodyLimit, null, true);

        let owner;

        if (this.owner === Tag.defaultValues.owner) {
            owner = "invalid";
        } else {
            const find = await getClient().findUserById(this.owner);

            if (find) {
                owner = find.username;
            } else {
                owner = "not found";
            }
        }

        const timeInfo = Object.fromEntries(
            Tag._timeProps.flatMap(prop => {
                const value = this[prop],
                    defaultValue = Tag.defaultValues[prop];

                const time = value === defaultValue ? "not set" : new Date(value).toUTCString(),
                    timestampName = `${prop}Timestamp`;

                return [
                    [prop, time],
                    [timestampName, value]
                ];
            })
        );

        const type = this.getType(),
            version = this.getVersion();

        const info = {
            hops: this.hops,
            isAlias: this.isAlias,
            name: this.name,
            aliasName,
            body,
            isScript: this.isScript,
            owner,
            ownerId: this.owner,
            args,
            ...timeInfo,
            type,
            version,
            typeInt: this.type
        };

        return info;
    }

    _setVersion(version) {
        const funcName = `set${Util.capitalize(version)}`;
        return this[funcName]();
    }

    static _hopsSeparator = ",";

    static _timeProps = ["registered", "lastEdited"];

    static _flags = [];
    static _readonlyFlags = ["script"];

    static _specialFlags = {
        old: ["new", false],
        new: [null, true]
    };

    static _getFlag(name, strict = true) {
        if (typeof name !== "string" || Util.empty(name)) {
            if (strict) {
                throw new TagError("Invalid flag");
            } else {
                return 0;
            }
        }

        const flag = TagFlags[name];

        if (typeof flag === "undefined") {
            throw new TagError("Unknown flag: " + name);
        }

        return flag;
    }

    static _setTimeFunc(prop) {
        const funcName = `set${Util.capitalize(prop)}`,
            func = function setTime(time) {
                time ??= Date.now();
                this[prop] = time;
                return time;
            };

        return {
            funcName,
            desc: { value: func }
        };
    }

    static _getFlagFunc(name, is, flagName = null, value = true) {
        flagName ??= name;

        const getFunc = (suffix, val) => {
            const funcName = `is${suffix}${Util.capitalize(name)}`,
                func = function hasFlag() {
                    return this.hasFlag(flagName) === val;
                };

            return {
                funcName,
                desc: { get: func }
            };
        };

        if (is === "both") {
            return [getFunc("", value), getFunc("Not", !value)];
        } else {
            const suffix = is ? "" : "Not";
            return getFunc(suffix, value);
        }
    }

    static _setFlagFunc(name, set, flagName = null, value = true) {
        flagName ??= name;

        const setFunc = (prefix, val) => {
            const funcName = `${prefix}set${Util.capitalize(name)}`,
                func = Util.bindArgs(Tag.prototype.setFlag, flagName, val);

            return {
                funcName,
                desc: { value: func }
            };
        };

        if (set === "both") {
            return [setFunc("", value), setFunc("un", !value)];
        } else {
            const prefix = set ? "" : "un";
            return setFunc(prefix, value);
        }
    }

    static _registerFunc(factory, ...args) {
        let res = factory(...args);

        if (!Array.isArray(res)) {
            res = [res];
        }

        for (const func of res) {
            const { funcName, desc } = func;

            if ([desc.get, desc.set].every(val => typeof val === "undefined")) {
                desc.writable = true;
            }

            Object.defineProperty(this.prototype, funcName, desc);
        }
    }

    static _processFlagConfig(name, type, config) {
        const factoryFunc = this[`_${type}FlagFunc`];

        if (Array.isArray(config)) {
            const [flagName, value] = config;

            if (type === "set" && value === "both") {
                this._registerFunc(factoryFunc, name, value, flagName, true);
            } else if (type === "get" || type === "set") {
                this._registerFunc(factoryFunc, name, true, flagName, value);
            }
        } else if (isObject(config)) {
            for (let [subType, subConfig] of Object.entries(config)) {
                if (!Array.isArray(subConfig)) {
                    continue;
                }

                const [flagName, value] = subConfig;
                subType = Util.parseBool(subType);

                if (subType !== null && value !== "both") {
                    this._registerFunc(factoryFunc, name, subType, flagName, value);
                }
            }
        }
    }

    static {
        const defaultTimes = Object.fromEntries(this._timeProps.map(prop => [prop, 0]));
        Object.assign(this.defaultValues, defaultTimes);

        for (const prop of this._timeProps) {
            this._registerFunc(this._setTimeFunc, prop);
        }

        for (const flag of this._flags) {
            this._registerFunc(this._getFlagFunc, flag, true);
            this._registerFunc(this._setFlagFunc, flag, "both");
        }

        for (const flag of this._readonlyFlags) {
            this._registerFunc(this._getFlagFunc, flag, true);
        }

        for (const [flag, config] of Object.entries(this._specialFlags)) {
            if (Array.isArray(config)) {
                this._processFlagConfig(flag, "get", config);
                this._processFlagConfig(flag, "set", config);
            } else if (isObject(config)) {
                for (const [type, subConfig] of Object.entries(config)) {
                    this._processFlagConfig(flag, type, subConfig);
                }
            }
        }
    }
}

export default Tag;
