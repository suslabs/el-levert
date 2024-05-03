import { bold } from "discord.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

import { getClient } from "../../LevertClient.js";
import Util from "../../util/Util.js";

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

class Tag {
    static defaultValues = defaultValues;

    constructor(data) {
        if (typeof data?.hops === "string") {
            data.hops = data.hops.split(",");
        }

        Util.setValuesWithDefaults(this, data, defaultValues);

        if (this.hops.length === 0) {
            this.hops.push(this.name);
        }

        if (typeof this.type === "string") {
            this.setType(this.type);
        }
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
    }

    setRegistered(time) {
        this.registered = time ?? Date.now();
    }

    setLastEdited(time) {
        this.lastEdited = time ?? Date.now();
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
        let newType = TagFlags.new;

        if (typeof type === "undefined" || type === TagTypes.defaultType) {
            this.type = newType;
            return;
        }

        if (TagTypes.scriptTypes.includes(type)) {
            newType |= TagFlags.script;
        }

        for (const specialType of TagTypes.specialScriptTypes) {
            if (type === specialType) {
                newType |= TagFlags[specialType];
                break;
            }
        }

        this.type = newType;
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
        const versionNum = TagTypes.versionTypes.indexOf(version);

        if (versionNum === -1) {
            return;
        }

        if (versionNum) {
            this.setNew();
        } else {
            this.setOld();
        }
    }

    getHopsString() {
        return this.hops.join(",");
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

    getRaw() {
        let out = {};

        const body = this.body.trim(),
            args = this.args.trim();

        if (this.isScript) {
            out.content = `Script type is **${this.getType()}**`;

            out = {
                ...out,
                ...Util.getFileAttach(body, "script.js")
            };
        } else if (this.isAlias) {
            out.content = `${bold(this.name)} is an alias of ${bold(this.aliasName)}`;

            if (this.args.length > 0) {
                out.content += ` (with args: )`;

                out = {
                    ...out,
                    ...Util.getFileAttach(args, "args.txt")
                };
            }
        } else {
            out = Util.getFileAttach(body, "tag.txt");
        }

        return out;
    }

    async getInfo(raw = false) {
        if (raw) {
            const info = {
                ...this
            };

            return info;
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
