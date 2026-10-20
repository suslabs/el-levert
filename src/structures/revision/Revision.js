import BaseStructure from "../BaseStructure.js";

import ObjectUtil from "../../util/ObjectUtil.js";

class Revision extends BaseStructure {
    static defaultValues = {
        id: 0,
        target: "",
        subjectId: 0,
        subjectIndex: 1,
        operation: "",
        actor: "unknown",
        created: 0,
        key: {},
        changed: [],
        snapshot: null,
        revertOf: null,
        restores: null,
        reason: null
    };

    static dataProps = [
        "id",
        "target",
        "subjectId",
        "subjectIndex",
        "operation",
        "actor",
        "created",
        "key",
        "changed",
        "snapshot",
        "revertOf",
        "restores",
        "reason"
    ];
    static nullableDataProps = ["snapshot", "revertOf", "restores", "reason"];

    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);

        const snapshot = data.snapshot ?? Revision.defaultValues.snapshot;
        delete data.snapshot;

        super(data);

        this.key = this.constructor._parseJson(this.key, {});
        this.changed = this.constructor._parseJson(this.changed, []);

        this._snapshot = snapshot;
        this._parsedSnapshot = undefined;
    }

    get snapshot() {
        if (typeof this._parsedSnapshot !== "undefined") {
            return this._parsedSnapshot;
        } else if (this._snapshot === null) {
            this._parsedSnapshot = null;
            return null;
        } else {
            this._parsedSnapshot = this.constructor._parseJson(this._snapshot, {});
            return this._parsedSnapshot;
        }
    }

    getData(data, prefix = "", nullable = true, props = this.constructor.dataProps) {
        if (props == null || props.includes("snapshot")) {
            data.snapshot = this.snapshot;
        }

        return data;
    }

    static _parseJson(value, fallback) {
        if (typeof value !== "string") {
            return value ?? structuredClone(fallback);
        }

        try {
            return JSON.parse(value);
        } catch (err) {
            return structuredClone(fallback);
        }
    }
}

export default Revision;
