import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

class AISourceLedger {
    static sourceKeys = new Set(["source", "url"]);

    constructor() {
        this.sources = new Set();
    }

    record(value) {
        if (Array.isArray(value)) {
            value.forEach(item => this.record(item));
        } else if (TypeTester.isObject(value)) {
            Object.entries(value).forEach(([key, item]) => this._recordEntry(key, item));
        }
    }

    has(source) {
        return this.sources.has(source);
    }

    toArray() {
        return Array.from(this.sources);
    }

    _recordEntry(key, item) {
        if (AISourceLedger.sourceKeys.has(key) && Util.nonemptyString(item)) {
            this.sources.add(item);
        } else {
            this.record(item);
        }
    }
}

export default AISourceLedger;
