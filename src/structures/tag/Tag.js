import { escapeMarkdown, bold, codeBlock } from "discord.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import FunctionUtil from "../../util/misc/FunctionUtil.js";
import DiscordUtil from "../../util/DiscordUtil.js";

import { TagTypes } from "./TagTypes.js";
import TagBitField from "./TagBitField.js";

import TagError from "../../errors/TagError.js";

class Tag {
    static invalidValues = {
        owner: "0"
    };

    static defaultValues = {
        name: "",
        body: "",
        owner: this.invalidValues.owner,
        args: "",
        aliasName: "",
        type: TagTypes.defaults.type
    };

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    static getFlag(names) {
        names = ArrayUtil.guaranteeArray(names);

        let invert = false;

        if (typeof names[0] === "boolean") {
            invert = !names[0];
            names.shift();
        }

        return TagBitField.filter(names, invert);
    }

    constructor(data) {
        let aliasName = data?.aliasName;

        if (typeof data?.hops === "string") {
            const hopString = data.hops,
                hops = hopString.split(Tag._hopsSeparator);

            if (
                !Util.nonemptyString(aliasName) &&
                hops.length === 1 &&
                hops[0] !== data.name &&
                Util.empty(data.body)
            ) {
                aliasName = hopString;
            } else if (!Util.nonemptyString(aliasName)) {
                aliasName = hops[1] ?? this.constructor.defaultValues.aliasName;
            }
        } else if (Array.isArray(data?.hops) && !Util.nonemptyString(aliasName)) {
            aliasName = data.hops[1] ?? this.constructor.defaultValues.aliasName;
        }

        if (data != null) {
            delete data.hops;
        }

        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);

        this.aliasName = aliasName ?? this.aliasName;
        this._fetched = false;

        if (typeof this.type === "string" || Array.isArray(this.type)) {
            this.setType(this.type);
        } else {
            this.type = this.constructor._normalizeType(this.type);
        }

        if (this.isAlias) {
            this.body = this.constructor.defaultValues.body;

            if (this.isScript) {
                this.setType(TagTypes.defaults.type);
            }
        }
    }

    get isAlias() {
        return Util.nonemptyString(this.aliasName) || Util.multiple(this._hops ?? []);
    }

    get hops() {
        if (Array.isArray(this._hops)) {
            return this._hops;
        }

        return this.isAlias ? [this.name, this.aliasName] : [this.name];
    }

    setName(name) {
        name ??= this.constructor.defaultValues.name;

        this.name = name;

        if (Array.isArray(this._hops)) {
            Util.setFirst(this._hops, name);
        }

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

        this.aliasName = target.name;
        delete this._hops;

        this.args = args ?? this.constructor.defaultValues.args;

        this.body = this.constructor.defaultValues.body;

        if (this.isScript) {
            this.setType(TagTypes.defaults.type);
        }
    }

    hasFlag(name) {
        Tag._getFlag(name);
        return this.type.get(TagTypes.flags[name].bit);
    }

    setFlag(name, value = true) {
        const config = Tag._getFlag(name);
        value = Boolean(value);

        for (const dependentName of config.clearedDependents[value]) {
            this.type.setFlag(dependentName, false);
        }

        if (value) {
            for (const required of config.requiredFlags) {
                this.type.setFlag(required.name, required.value);
            }
        }

        this.type.setFlag(name, value);
        return this.type;
    }

    getVersion() {
        for (const version of TagTypes.versions.names) {
            const propName = `is${Util.capitalize(version)}`;

            if (this[propName]) {
                return version;
            }
        }
    }

    setVersion(version) {
        if (!Util.nonemptyString(version)) {
            throw new TagError("Invalid version");
        } else if (!Object.hasOwn(TagTypes.versions, version)) {
            throw new TagError("Unknown version: " + version, version);
        }

        const config = TagTypes.versions[version];
        return this.setFlag(config.flag, config.value);
    }

    getType() {
        if (!this.isScript) {
            return TagTypes.defaults.type;
        }

        for (const type of TagTypes.types.specialScript) {
            if (this[`is${Util.capitalize(type)}`]) {
                return type;
            }
        }

        return TagTypes.defaults.scriptType;
    }

    setType(type) {
        const normalized = this.constructor._parseType(type),
            typeConfig = TagTypes.types[normalized.type];

        if (typeConfig == null) {
            throw new TagError("Unknown type: " + normalized.type, normalized.type);
        }

        this.type = TagBitField.from();
        this.setVersion(normalized.version);

        for (const [flagName, flagValue] of Object.entries(typeConfig.flags)) {
            this.setFlag(flagName, flagValue);
        }

        return this.type;
    }

    getData(prefix = "", nullable = true, props = this.constructor.dataProps) {
        const db = !Util.empty(prefix),
            data = ObjectUtil.filterObject(this, key => props.includes(key));

        if (props.includes("type")) {
            data.type = db ? this.type.toBuffer() : this.type.toNumber();
        }

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(prop => props.includes(prop))) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
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
        tag = this.constructor.from(tag);
        return this.type.equals(tag.type) && this.isAlias === tag.isAlias;
    }

    equivalent(tag) {
        return this.sameBody(tag) && this.sameType(tag);
    }

    sameAlias(tag) {
        return this.aliasName === tag.aliasName;
    }
    equals(tag) {
        return this.equivalent(tag) && this.sameAlias(tag);
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
            const formattedName = discord ? bold(escapeMarkdown(this.name)) : this.name,
                formattedAliasName = discord ? bold(escapeMarkdown(this.aliasName)) : this.aliasName,
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

    getInfo(raw = false, bodyLimit = 300) {
        if (raw) {
            return this.getData();
        }

        return (async () => {
            const aliasName = this.isAlias ? this.aliasName : "none",
                body = Util.empty(this.body)
                    ? "empty"
                    : Util.trimString(this.body, bodyLimit, null, { showDiff: true }),
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
                typeInt: this.type.toNumber()
            };

            return info;
        })();
    }

    _setAliasProps(hops, args) {
        if (Array.isArray(hops) && !Util.empty(hops)) {
            this._hops = hops;
            this.aliasName = hops[1] ?? this.constructor.defaultValues.aliasName;
        }

        const argsList = ArrayUtil.guaranteeArray(args ?? []).filter(arg => !Util.empty(arg));
        this.args = argsList.join(Tag._argsSeparator);

        this._fetched = true;
    }

    _setOriginalProps(tag) {
        this.name = tag.name;
        this.owner = tag.owner;
    }

    static dataProps = ["aliasName", "name", "body", "owner", "args", "registered", "lastEdited", "type"];
    static _nullableDataProps = ["aliasName", "args"];

    static _hopsSeparator = ",";
    static _argsSeparator = " ";

    static _timeProps = ["registered", "lastEdited"];

    static _setupDefaultValues() {
        const invalidTimes = Object.fromEntries(this._timeProps.map(prop => [prop, 0]));
        Object.assign(this.invalidValues, invalidTimes);

        for (const prop of this._timeProps) {
            this.defaultValues[prop] ??= invalidTimes[prop];
        }
    }

    static _getFlag(name, strict = true) {
        if (!Util.nonemptyString(name)) {
            if (!strict) {
                return false;
            }

            throw new TagError("Invalid flag");
        }

        const config = TagTypes.flags[name];

        if (config == null) {
            throw new TagError("Unknown flag: " + name, name);
        }

        return config;
    }

    static _parseType(input) {
        let type = input,
            version = TagTypes.defaults.version;

        if (Array.isArray(input)) {
            if (input.length > 2) {
                throw new TagError("Invalid type", input);
            }

            [type, version] = input;
        } else if (TagTypes.versions.valid.has(input)) {
            type = TagTypes.defaults.type;
            version = input;
        }

        if (!Util.nonemptyString(type)) {
            throw new TagError("Invalid type");
        }

        if (!TagTypes.versions.valid.has(version)) {
            throw new TagError("Unknown version: " + version, version);
        }

        return { type, version };
    }

    static _normalizeType(type) {
        const normalized = type instanceof TagBitField ? type.clone() : TagBitField.from(type);

        if (normalized.invert) {
            throw new TagError("Invalid type", type);
        }

        return normalized;
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
        const factoryFunc = this[`_${type}FlagFunc`],
            [flagName, value] = config;

        if (type === "set" && value === "both") {
            this._registerFunc(factoryFunc, name, value, flagName, true);
        } else if (type === "get" || type === "set") {
            this._registerFunc(factoryFunc, name, true, flagName, value);
        }
    }

    static _registerFlagFuncs() {
        for (const prop of this._timeProps) {
            this._registerFunc(this._setTimeFunc, prop);
        }

        for (const [flag, config] of TagTypes.flags.entries) {
            if (config.accessors === "write") {
                this._registerFunc(this._getFlagFunc, flag, true);
                this._registerFunc(this._setFlagFunc, flag, "both");
            } else if (config.accessors === "read") {
                this._registerFunc(this._getFlagFunc, flag, true);
            }
        }

        for (const [flag, config] of TagTypes.versions.entries) {
            this._processFlagConfig(flag, "get", [config.flag, config.value]);
            this._processFlagConfig(flag, "set", [config.flag, config.value]);
        }
    }

    static {
        this._setupDefaultValues();
        this._registerFlagFuncs();
    }
}

export default Tag;
