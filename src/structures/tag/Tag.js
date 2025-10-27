import { bold, codeBlock } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import FunctionUtil from "../../util/misc/FunctionUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

import TagError from "../../errors/TagError.js";

class Tag {
    static invalidValues = {
        owner: "0"
    };

    static defaultValues = {
        hops: [],
        name: "",
        body: "",
        owner: this.invalidValues.owner,
        args: "",
        type: TagTypes.defaultType
    };

    static getFlag(names) {
        let invert = false;

        if (Array.isArray(names)) {
            const flag = Util.first(names);

            if (typeof flag === "boolean") {
                invert = !flag;
                ArrayUtil.removeItem(names, 0);
            }
        } else {
            const name = names;
            names = [name];
        }

        const flag = names.reduce((flag, name) => flag | this._getFlag(name, false), 0);
        return invert ? -flag : flag;
    }

    constructor(data) {
        if (typeof data?.hops === "string") {
            data.hops = data.hops.split(Tag._hopsSeparator);
        }

        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);

        let type = this.type,
            userType = typeof type === "string";

        if (Util.empty(this.hops)) {
            this.hops.push(this.name);
        } else if (this.isAlias) {
            this.body = this.constructor.defaultValues.body;

            if (userType) {
                type = TagTypes.textType;
            }
        }

        this._fetched = false;

        if (userType) {
            this.setType(type);
        }
    }

    get isAlias() {
        return Util.multiple(this.hops);
    }

    get aliasName() {
        return this.isAlias ? this.hops[1] : "";
    }

    getHopsString() {
        return this.hops.join(Tag._hopsSeparator);
    }

    setName(name) {
        name ??= this.constructor.defaultValues.name;

        this.name = name;
        Util.setFirst(this.hops, name);

        return true;
    }

    setOwner(owner) {
        this.owner = owner ?? this.constructor.defaultValues.owner;
        return true;
    }

    setBody(body, type) {
        this.body = body ?? this.constructor.defaultValues.body;

        if (type != null) {
            this.setType(type);
        }

        return true;
    }

    aliasTo(target, args) {
        if (target == null) {
            throw new TagError("No target tag provided");
        }

        this.hops.push(...target.hops);
        this.args = args ?? this.constructor.defaultValues.args;

        this.body = this.constructor.defaultValues.body;

        if (this.isScript) {
            this.setType(TagTypes.textType);
        }
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
        if (!Util.nonemptyString(version)) {
            throw new TagError("Invalid version");
        } else if (!TagTypes.versionTypes.includes(version)) {
            throw new TagError("Unknown version: " + version, version);
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
                throw new TagError("Invalid type", type);
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

        if (!Util.nonemptyString(type)) {
            throw new TagError("Invalid type");
        } else if (type === TagTypes.textType) {
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
            throw new TagError("Unknown type: " + type, type);
        }

        this.type = newType;
        return newType;
    }

    getData() {
        return ObjectUtil.filterObject(this, key => !key.startsWith("_"));
    }

    getSize() {
        const sizes = [this.body, this.args].map(str => Util.utf8ByteLength(str));
        return ArrayUtil.sum(sizes) / Util.dataBytes.kilobyte;
    }

    async getOwner(username = true, onlyMembers = false, sv_id) {
        if (Util.empty(this.owner) || this.owner === Tag.invalidValues.owner) {
            return username ? "invalid" : null;
        }

        let owner;

        if (onlyMembers) {
            owner = Util.first(
                await getClient().findUsers(this.owner, {
                    onlyMembers,
                    sv_id
                })
            );
        } else {
            owner = await getClient().findUserById(this.owner);
        }

        if (owner == null) {
            return username ? "not found" : null;
        } else if (!username) {
            return owner;
        }

        return owner.user.username + (owner.nickname ? `(${owner.nickname})` : "");
    }

    format(argsLimit = 100) {
        let format = this.name;

        if (this.isAlias) {
            format += ` (-> ${this.aliasName}`;

            if (!Util.empty(this.args)) {
                format += `: ${Util.trimString(this.args, argsLimit)}`;
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

    equivalent(tag) {
        return this.sameBody(tag) && this.sameType(tag);
    }

    sameHops(tag) {
        return ArrayUtil.sameElements(this.hops, tag.hops);
    }

    equals(tag) {
        return this.equivalent(tag) && this.sameHops(tag);
    }

    getRaw(discord = false) {
        const body = this.body.trim(),
            args = this.args.trim();

        if (this.isScript) {
            const formattedType = discord ? bold(this.getType()) : this.getType(),
                header = `Script type is ${formattedType}.`;

            return discord
                ? {
                      content: header,
                      ...DiscordUtil.getFileAttach(body, `${this.name}.js`)
                  }
                : `${header}\n---\n${body}\n---`;
        }

        if (this.isAlias) {
            const formattedName = discord ? bold(this.name) : this.name,
                formattedAliasName = discord ? bold(this.aliasName) : this.aliasName,
                header = `${formattedName} is an alias of ${formattedAliasName}.`;

            if (Util.empty(this.args)) {
                return discord ? { content: header } : header;
            } else if (discord) {
                let out = `${header} (with args: )`;

                if (Util.overSizeLimits(this.args, 500, 1)) {
                    return {
                        content: out,
                        ...DiscordUtil.getFileAttach(args, `${this.name}-args.txt`)
                    };
                }

                out += `\n${codeBlock(this.args)}`;
                return { content: out };
            } else {
                return `${header} (with args: ${this.args})`;
            }
        }

        return discord ? DiscordUtil.getFileAttach(body, `${this.name}.txt`) : body;
    }

    getTimeInfo(raw = false) {
        return Object.fromEntries(
            this.constructor._timeProps.map(prop => {
                const value = this[prop];

                if (raw) {
                    const timestampName = `${prop}Timestamp`;
                    return [timestampName, value];
                } else {
                    const invalidValue = this.constructor.invalidValues[prop],
                        time = value === invalidValue ? "not set" : new Date(value).toUTCString();

                    return [prop, time];
                }
            })
        );
    }

    async getInfo(raw = false, bodyLimit = 300) {
        if (raw) {
            return this.getData();
        }

        const aliasName = this.isAlias ? this.aliasName : "none",
            body = Util.empty(this.body) ? "empty" : Util.trimString(this.body, bodyLimit, null, { showDiff: true }),
            args = Util.empty(this.args) ? "none" : Util.trimString(this.args, bodyLimit, null, { showDiff: true });

        const info = {
            hops: this.hops,
            isAlias: this.isAlias,
            name: this.name,
            aliasName,
            body,
            isScript: this.isScript,
            owner: await this.getOwner(),
            ownerId: this.owner,
            args,
            ...this.getTimeInfo(false),
            ...this.getTimeInfo(true),
            type: this.getType(),
            version: this.getVersion(),
            typeInt: this.type
        };

        return info;
    }

    _setAliasProps(hops, args) {
        if (Array.isArray(hops) && !Util.empty(hops)) {
            this.hops = hops;
        }

        const argsList = [].concat(args ?? []).filter(arg => !Util.empty(arg));
        this.args = argsList.join(Tag._argsSeparator);

        this._fetched = true;
    }

    _setOriginalProps(tag) {
        this.name = tag.name;
        this.owner = tag.owner;
    }

    _setVersion(version) {
        const funcName = `set${Util.capitalize(version)}`;
        return this[funcName]();
    }

    static _hopsSeparator = ",";
    static _argsSeparator = " ";

    static _timeProps = ["registered", "lastEdited"];

    static _flags = [];
    static _readonlyFlags = ["script"];

    static _specialFlags = {
        old: ["new", false],
        new: [null, true]
    };

    static _setupDefaultValues() {
        const invalidTimes = Object.fromEntries(this._timeProps.map(prop => [prop, 0]));
        Object.assign(this.invalidValues, invalidTimes);

        for (const prop of this._timeProps) {
            this.defaultValues[prop] ??= invalidTimes[prop];
        }
    }

    static _getFlag(name, strict = true) {
        if (!Util.nonemptyString(name)) {
            return strict
                ? (() => {
                      throw new TagError("Invalid flag");
                  })()
                : 0;
        }

        const flag = TagFlags[name];

        if (typeof flag === "undefined") {
            throw new TagError("Unknown flag: " + name, name);
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
            propName: funcName,
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
                propName: funcName,
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
                func = FunctionUtil.bindArgs(Tag.prototype.setFlag, [flagName, val]);

            return {
                propName: funcName,
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
        ObjectUtil.defineProperty(this.prototype, factory, ...args);
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
        } else if (TypeTester.isObject(config)) {
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

    static _registerFlagFuncs() {
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
            } else if (TypeTester.isObject(config)) {
                for (const [type, subConfig] of Object.entries(config)) {
                    this._processFlagConfig(flag, type, subConfig);
                }
            }
        }
    }

    static {
        this._setupDefaultValues();
        this._registerFlagFuncs();
    }
}

export default Tag;
