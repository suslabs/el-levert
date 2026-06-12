import { escapeMarkdown, bold, codeBlock } from "discord.js";

import TagBitField from "./TagBitField.js";
import { TagTypes } from "./TagTypes.js";
import { resolveVMLanguage } from "../vm/VMLanguages.js";

import { getClient } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import TypeTester from "../../util/TypeTester.js";
import DiscordUtil from "../../util/DiscordUtil.js";
import FunctionUtil from "../../util/misc/FunctionUtil.js";

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
        aliasName: ""
    };

    static dataProps = ["aliasName", "name", "body", "owner", "args", "registered", "lastEdited", "type"];

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    static getFlag(names) {
        names = ArrayUtil.guaranteeArray(names, null, true);

        let include = true;

        if (typeof names[0] === "boolean") {
            include = names[0];
            names.shift();
        }

        names = names.filter(name => !Util.empty(name));
        return TagBitField.filter(names, include);
    }

    static normalizeMeta(meta) {
        if (!TypeTester.isObject(meta)) {
            throw new TagError("Invalid tag meta", meta);
        }

        meta = ObjectUtil.setValuesWithDefaults({}, meta, TagTypes.defaults.meta);

        return {
            version: this._normalizeVersion(meta.version),
            type: this._normalizeScriptType(meta.type),
            language: this._normalizeLanguage(meta.language)
        };
    }

    constructor(data) {
        let aliasName = data?.aliasName,
            type = data?.type,
            meta = data?.meta;

        if (typeof data?.hops === "string") {
            const hopString = data.hops,
                hops = hopString.split(this.constructor._hopsSeparator);

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
            delete data.meta;
        }

        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);

        this.aliasName = aliasName ?? this.aliasName;
        this._fetched = false;

        this.type = TagBitField.from(type);

        if (meta != null) {
            this.setMeta(meta);
        }

        if (this.isAlias) {
            this.body = this.constructor.defaultValues.body;
            this.setScriptType(TagTypes.defaults.type);
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

    setBody(body, meta) {
        this.body = body ?? this.constructor.defaultValues.body;

        if (meta != null) {
            this.setMeta(meta);
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
        this.setScriptType(TagTypes.defaults.type);
    }

    getVersion() {
        return TagTypes.versions.entries.find(([, version]) => this.type.hasFlag(version.flag) === version.value)?.[0];
    }

    setVersion(version) {
        version = this.constructor._normalizeVersion(version);

        const config = TagTypes.versions[version];
        this.type.setFlag(config.flag, config.value);

        return this;
    }

    getScriptType() {
        return TagTypes.types.entries.find(([, type]) =>
            type.flags.every(([flag, value]) => this.type.hasFlag(flag) === value)
        )?.[0];
    }

    setScriptType(type) {
        type = this.constructor._normalizeScriptType(type);

        const config = TagTypes.types[type],
            specialFlags = TagTypes.types.specialScript.map(name => TagTypes.types[name].flag).filter(Boolean);

        this.type.setFlags(specialFlags, false);

        if (!config.script) {
            this.setScriptLanguage(TagTypes.defaults.language);
        }

        this.type.setFlag("script", config.script);

        if (typeof config.flag !== "undefined") {
            this.type.setFlag(config.flag, true);
        }

        return this;
    }

    getScriptLanguage() {
        return TagTypes.languages.matches.find(([, language]) =>
            language.flags.every(([flag, value]) => this.type.hasFlag(flag) === value)
        )?.[0];
    }

    setScriptLanguage(language) {
        language = Tag._normalizeLanguage(language);

        const config = TagTypes.languages[language];
        this.type.setFlags(TagTypes.languages.flags, false);

        if (typeof config.flag !== "undefined") {
            this.type.setFlag(config.flag, config.value);
        }

        return this;
    }

    getMeta() {
        return {
            version: this.getVersion(),
            type: this.getScriptType(),
            language: this.getScriptLanguage()
        };
    }

    setMeta(meta) {
        meta = Tag.normalizeMeta(meta);

        this.setVersion(meta.version);
        this.setScriptType(meta.type);
        this.setScriptLanguage(meta.language);

        return this;
    }

    getData(prefix = "", nullable = true, props = this.constructor.dataProps) {
        const db = !Util.empty(prefix),
            data = ObjectUtil.filterObject(this, key => props.includes(key));

        if (props.includes("type")) {
            data.type = db ? this.type.toBuffer() : this.type.toHex();
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
        if (Util.empty(this.owner) || this.owner === this.constructor.invalidValues.owner) {
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
            const formattedType = discord ? bold(this.getScriptType()) : this.getScriptType(),
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
                type: this.getScriptType(),
                language: this.getScriptLanguage(),
                version: this.getVersion(),
                typeData: this.type.toHex()
            };

            return info;
        })();
    }

    static _nullableDataProps = ["aliasName", "args"];

    static _hopsSeparator = ",";
    static _argsSeparator = " ";

    static _timeProps = ["registered", "lastEdited"];

    static _normalizeMetaValue(value, options) {
        const { name, valid, unknown, ...enumOptions } = options;

        enumOptions.unknown = unknown ?? true;
        return TypeTester.normalizeEnum(value, valid, name, TagError, enumOptions);
    }

    static _normalizeVersion(version) {
        return this._normalizeMetaValue(version, {
            name: "version",
            valid: TagTypes.versions.valid
        });
    }

    static _normalizeScriptType(type) {
        return this._normalizeMetaValue(type, {
            name: "type",
            valid: TagTypes.types.valid
        });
    }

    static _normalizeLanguage(language) {
        return this._normalizeMetaValue(language, {
            name: "language",
            normalize: resolveVMLanguage,
            valid: TagTypes.languages.valid,
            unknown: "Unsupported script"
        });
    }

    static _setupDefaultValues() {
        const invalidTimes = Object.fromEntries(this._timeProps.map(prop => [prop, 0]));
        Object.assign(this.invalidValues, invalidTimes);

        for (const prop of this._timeProps) {
            this.defaultValues[prop] ??= invalidTimes[prop];
        }
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
                    return this.type.hasFlag(flagName) === val;
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
                func = FunctionUtil.bindArgs(
                    function setFlag(flagName, val) {
                        this.type.setFlag(flagName, val);
                        return this;
                    },
                    [flagName, val]
                );

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

        for (const [version, config] of TagTypes.versions.entries) {
            this._processFlagConfig(version, "get", [config.flag, config.value]);
            this._processFlagConfig(version, "set", [config.flag, config.value]);
        }
    }

    static {
        this._setupDefaultValues();
        this._registerFlagFuncs();
    }

    _setAliasProps(hops, args) {
        if (Array.isArray(hops) && !Util.empty(hops)) {
            this._hops = hops;
            this.aliasName = hops[1] ?? this.constructor.defaultValues.aliasName;
        }

        const argsList = ArrayUtil.guaranteeArray(args ?? []).filter(arg => !Util.empty(arg));
        this.args = argsList.join(this.constructor._argsSeparator);

        this._fetched = true;
    }

    _setOriginalProps(tag) {
        this.name = tag.name;
        this.owner = tag.owner;
    }
}

export default Tag;
