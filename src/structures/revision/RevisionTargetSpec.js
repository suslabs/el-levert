import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import RevisionError from "../../errors/RevisionError.js";

class RevisionTargetSpec {
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

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);
        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

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
        return typeof this.encode === "function" ? this.encode(field, value) : value;
    }

    decodeValue(field, value) {
        return typeof this.decode === "function" ? this.decode(field, value) : value;
    }

    getLabel(key) {
        return typeof this.label === "function" ? this.label(key) : Object.values(key).join(":");
    }

    _extract(data, fields) {
        return Object.fromEntries(fields.map(field => [field, this.encodeValue(field, data[field])]));
    }
}

export default RevisionTargetSpec;
