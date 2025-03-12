import { bold } from "discord.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

import { getClient } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import TagError from "../../errors/TagError.js";

class Tag {
    static defaultValues = {
        hops: [],
        name: "",
        body: "",
        owner: "0",
        args: "",
        registered: 0,
        lastEdited: 0,
        type: TagFlags.new
    };

    static hopsSeparator = ",";

    constructor(data) {
        if (typeof data?.hops === "string") {
            data.hops = data.hops.split(Tag.hopsSeparator);
        }

        Util.setValuesWithDefaults(this, data, Tag.defaultValues);

        if (Util.empty(this.hops)) {
            this.hops.push(this.name);
        } else if (this.isAlias) {
            this.body = Tag.defaultValues.body;
            this.type &= TagFlags.new;
        }

        if (typeof this.type === "string") {
            this.setType(this.type);
        }

        this._fetched = false;
    }

    get isAlias() {
        return Util.multiple(this.hops);
    }

    get isOld() {
        return (this.type & TagFlags.new) === 0;
    }

    get isScript() {
        return (this.type & TagFlags.script) >> 1 === 1;
    }

    get aliasName() {
        if (!this.isAlias) {
            return "";
        }

        return this.hops[1];
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

        if (typeof type !== "undefined") {
            this.setType(type);
        }
    }

    setAliasProps(hops, args) {
        this.hops = hops ?? Tag.defaultValues.hops;
        this.args = args ?? Tag.defaultValues.args;

        this._fetched = true;
    }

    setRegistered(time) {
        this.registered = time ?? Date.now();
    }

    setLastEdited(time) {
        this.lastEdited = time ?? Date.now();
    }

    getData() {
        const filtered = Object.entries(this).filter(x => {
            const key = x[0];
            return !key.startsWith("_");
        });

        return Object.fromEntries(filtered);
    }

    getType() {
        if (!this.isScript) {
            return TagTypes.defaultType;
        }

        for (const specialType of TagTypes.specialScriptTypes) {
            const flag = TagFlags[specialType];

            if ((this.type & flag) === flag) {
                return specialType;
            }
        }

        return TagTypes.defaultScriptType;
    }

    setType(type) {
        let version,
            multipleType = false;

        if (Array.isArray(type)) {
            if (Util.empty(type) || type.length > 2) {
                throw new TagError("Invalid type");
            }

            [type, version] = type;
            multipleType = true;
        }

        if (typeof type !== "string" || Util.empty(type)) {
            throw new TagError("Invalid type");
        }

        let newType;

        if (multipleType) {
            if (typeof version !== "string" || Util.empty(version)) {
                throw new TagError("Invalid version");
            }

            if (!TagTypes.versionTypes.includes(version)) {
                throw new TagError("Unknown version: " + version);
            }

            newType = TagFlags[version];
        } else if (!this.setVersion(type)) {
            newType = TagFlags.new;
        }

        if (type === TagTypes.defaultType) {
            this.type = newType;
            return;
        }

        if (TagTypes.scriptTypes.includes(type)) {
            newType |= TagFlags.script;

            this.type = newType;
            return;
        }

        for (const specialType of TagTypes.specialScriptTypes) {
            if (type === specialType) {
                newType |= TagFlags[specialType];

                this.type = newType;
                return;
            }
        }

        throw new TagError("Unknown type: " + type);
    }

    getVersion() {
        const versionNum = this.isOld ? 0 : 1;
        return TagTypes.versionTypes[versionNum];
    }

    setOld() {
        if (this.isOld) {
            return;
        }

        this.type &= ~TagFlags.new;
    }

    setNew() {
        if (!this.isOld) {
            return;
        }

        this.type |= TagFlags.new;
    }

    setVersion(version) {
        if (typeof version !== "string" || Util.empty(version)) {
            throw new TagError("Invalid version");
        }

        const versionNum = TagTypes.versionTypes.indexOf(version);

        switch (versionNum) {
            case -1:
                return false;
            case 0:
                this.setOld();
                break;
            case 1:
                this.setNew();
                break;
        }

        return true;
    }

    getHopsString() {
        return this.hops.join(Tag.hopsSeparator);
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
        return this.hops.length === tag.hops.length && this.hops.every((hop, i) => tag.hops[i] === hop);
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

    async getInfo(raw = false) {
        if (raw) {
            return this.getData();
        }

        const aliasName = this.isAlias ? this.aliasName : "none",
            body = Util.empty(this.body) ? "empty" : this.body,
            args = Util.empty(this.args) ? "none" : this.args;

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

        const registered =
                this.registered === Tag.defaultValues.registered ? "not set" : new Date(this.registered).toUTCString(),
            lastEdited =
                this.lastEdited === Tag.defaultValues.lastEdited ? "not set" : new Date(this.lastEdited).toUTCString();

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
            registered,
            lastEdited,
            registeredTimestamp: this.registered,
            lastEditedTimestamp: this.lastEdited,
            type,
            version,
            typeInt: this.type
        };

        return info;
    }
}

export default Tag;
