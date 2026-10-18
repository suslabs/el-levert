import BaseStructure from "../BaseStructure.js";

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
        super(data);

        this.key = this.constructor._parseJson(this.key, {});
        this.changed = this.constructor._parseJson(this.changed, []);
        this.snapshot = this.snapshot === null ? null : this.constructor._parseJson(this.snapshot, {});
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
