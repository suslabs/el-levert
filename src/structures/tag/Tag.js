import Util from "../../util/Util.js";

import { TagFlags, TagTypes } from "./TagFlags.js";

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

        Object.assign(this, {
            ...defaultValues,
            ...data
        });

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
        return this.type & TagFlags.script;
    }

    getType() {
        if (!this.isScript) {
            return TagTypes.defaultType;
        }

        for (const specialType of TagTypes.specialScriptTypes) {
            if (this.type & TagFlags[specialType]) {
                return specialType;
            }
        }

        return TagTypes.defaultScriptType;
    }

    setType(type) {
        if (typeof type === "undefined" || type === TagTypes.defaultType) {
            return TagFlags.new;
        }

        let newType = TagFlags.new;

        if (ScriptTypes.includes(type)) {
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
}

export default Tag;
