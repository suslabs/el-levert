import BaseStructure from "../BaseStructure.js";

class RevisionSubject extends BaseStructure {
    static defaultValues = {
        id: 0,
        target: "",
        key: {},
        staticSnapshot: {},
        active: 1,
        deleted: null,
        created: 0
    };

    static dataProps = ["id", "target", "key", "staticSnapshot", "active", "deleted", "created"];
    static nullableDataProps = ["deleted"];

    constructor(data) {
        super(data);

        this.key = this.constructor._parseJson(this.key, {});
        this.staticSnapshot = this.constructor._parseJson(this.staticSnapshot, {});
    }

    get deletedState() {
        return this.deleted !== null;
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

export default RevisionSubject;
