import { bold } from "discord.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

import { getClient } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import TagError from "../../errors/TagError.js";

const defaultValues = {
    hops: [],
    name: "",
    body: "",
    owner: "0",
    args: "",
    registered: 0,
    lastEdited: 0,
    type: TagFlags.new
};

const hopsSeparator = ",";

const privateProps = ["fetched"];

class Tag {
    static defaultValues = defaultValues;
    static hopsSeparator = hopsSeparator;

    constructor(data) {
        if (typeof data?.hops === "string") {
            data.hops = data.hops.split(hopsSeparator);
        }

        Util.setValuesWithDefaults(this, data, defaultValues);

        if (this.hops.length === 0) {
            this.hops.push(this.name);
        } else if (this.isAlias) {
            this.body = defaultValues.body;
            this.type &= TagFlags.new;
        }

        if (typeof this.type === "string") {
            this.setType(this.type);
        }

        this.fetched = false;
    }

    get isAlias() {
        return this.hops.length > 1;
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
        name ??= defaultValues.name;

        this.name = name;
        this.hops[0] = name;
    }

    setOwner(owner) {
        this.owner = owner ?? defaultValues.owner;
    }

    setBody(body, type) {
        this.body = body ?? defaultValues.body;

        if (typeof type !== "undefined") {
            this.setType(type);
        }
    }

    setAliasProps(hops, args) {
        this.hops = hops ?? defaultValues.hops;
        this.args = args ?? defaultValues.args;

        this.fetched = true;
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
            return !privateProps.includes(key);
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
            if (type.length === 0 || type.length > 2) {
                throw new TagError("Invalid type");
            }

            [type, version] = type;
            multipleType = true;
        }

        if (typeof type !== "string" || type.length < 1) {
            throw new TagError("Invalid type");
        }

        let newType;

        if (multipleType) {
            if (typeof version !== "string" || version.length < 1) {
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
        if (typeof version !== "string" || version.length < 1) {
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
        return this.hops.join(hopsSeparator);
    }

    getSize() {
        const bodySize = Util.getByteLen(this.body),
            argsSize = Util.getByteLen(this.args);

        const totalSize = bodySize + argsSize;
        return totalSize / 1024;
    }

    format() {
        let format = this.name;

        if (this.isAlias) {
            format += ` (-> ${this.aliasName}`;

            if (this.args.length > 0) {
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

            if (this.args.length > 0) {
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
            body = this.body.length < 1 ? "empty" : this.body,
            args = this.args.length < 1 ? "none" : this.args;

        let owner;

        if (this.owner === defaultValues.owner) {
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
                this.registered === defaultValues.registered ? "not set" : new Date(this.registered).toUTCString(),
            lastEdited =
                this.lastEdited === defaultValues.lastEdited ? "not set" : new Date(this.lastEdited).toUTCString();

        const type = this.getType(),
            version = this.getVersion();

        const info = {
            hops: this.hops,
            isAlias: this.isAlias,
            name: this.name,
            aliasName,
            body,
            owner,
            ownerId: this.owner,
            args,
            registered,
            lastEdited,
            registeredTimestamp: this.registered,
            lastEditedTimestamp: this.lastEdited,
            isScript: this.isScript,
            type,
            version,
            typeInt: this.type
        };

        return info;
    }
}

export default Tag;
