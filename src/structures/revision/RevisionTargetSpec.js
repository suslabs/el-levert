import BaseStructure from "../BaseStructure.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import RevisionError from "../../errors/RevisionError.js";

class RevisionTargetSpec extends BaseStructure {
    static defaultValues = {
        target: "",
        key: [],
        staticFields: [],
        trackedFields: [],
        liveFields: [],
        encode: null,
        decode: null,
        label: null
    };

    static dataProps = ["target", "key", "staticFields", "trackedFields", "liveFields", "encode", "decode", "label"];

    constructor(options) {
        super(options);

        this.key = ArrayUtil.guaranteeArray(this.key, null, true);
        this.staticFields = ArrayUtil.guaranteeArray(this.staticFields, null, true);
        this.trackedFields = ArrayUtil.guaranteeArray(this.trackedFields, null, true);
        this.liveFields = ArrayUtil.guaranteeArray(this.liveFields, null, true);

        if (Util.empty(this.target)) {
            throw new RevisionError("Revision target is required");
        } else if (Util.empty(this.key)) {
            throw new RevisionError("Revision target key is required", this.target);
        }
    }

    getKey(data) {
        return this._extract(data, this.key);
    }

    getStaticSnapshot(data) {
        return this._extract(data, this.staticFields);
    }

    getSnapshot(data) {
        return this._extract(data, this.trackedFields);
    }

    encodeValue(field, value) {
        if (typeof this.encode !== "function") {
            return value;
        }

        return this.encode(field, value);
    }

    decodeValue(field, value) {
        if (typeof this.decode !== "function") {
            return value;
        }

        return this.decode(field, value);
    }

    getLabel(key) {
        if (typeof this.label !== "function") {
            return Object.values(key).join(":");
        }

        return this.label(key);
    }

    _extract(data, fields) {
        return Object.fromEntries(fields.map(field => [field, this.encodeValue(field, data[field])]));
    }
}

export default RevisionTargetSpec;
