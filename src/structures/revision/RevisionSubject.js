import ObjectUtil from "../../util/ObjectUtil.js";

class RevisionSubject {
    static defaultValues = {
        id: 0,
        target: "",
        key: {},
        staticSnapshot: {},
        active: 1,
        deleted: null,
        created: 0
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
        this.staticSnapshot = this.constructor._parseJson(this.staticSnapshot, {});
    }

    get deletedState() {
        return this.deleted !== null;
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

    static dataProps = ["id", "target", "key", "staticSnapshot", "active", "deleted", "created"];
    static _nullableDataProps = ["deleted"];

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

export default RevisionSubject;
