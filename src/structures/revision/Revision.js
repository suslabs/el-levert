import ObjectUtil from "../../util/ObjectUtil.js";

class Revision {
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
        reason: ""
    };

    static from(data, nullable = false, ...args) {
        if (nullable && data === null) {
            return null;
        }

        return data instanceof this ? data : new this(data, ...args);
    }

    constructor(data) {
        ObjectUtil.setValuesWithDefaults(this, data, this.constructor.defaultValues);

        this.key = this.constructor._parseJson(this.key, {});
        this.changed = this.constructor._parseJson(this.changed, []);
        this.snapshot = this.snapshot === null ? null : this.constructor._parseJson(this.snapshot, {});
    }

    getData(prefix = "", nullable = true, props = this.constructor.dataProps) {
        const data = ObjectUtil.filterObject(this, key => props.includes(key));

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(prop => props.includes(prop))) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
    }

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

    static _nullableDataProps = ["snapshot", "revertOf", "restores", "reason"];

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
