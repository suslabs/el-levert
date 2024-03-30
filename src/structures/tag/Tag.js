import { bold } from "discord.js";

import { TagFlags, TagTypes } from "./TagTypes.js";

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

    getHopsString() {
        return this.hops.join(",");
    }

    getSize() {
        const bodySize = Util.getByteLen(this.body),
            argsSize = Util.getByteLen(this.args);

        const totalSize = bodySize + argsSize;
        return totalSize / 1024;
    }

    isEquivalent(tag) {
        return this.body === tag.body && this.type === tag.type;
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
}

export default Tag;
