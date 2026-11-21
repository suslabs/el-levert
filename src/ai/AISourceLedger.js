import Util from "../util/Util.js";

class AISourceLedger {
    constructor(seed) {
        this.text = Util.empty(seed) ? "" : JSON.stringify(seed);
    }

    record(value) {
        this.text += `\n${JSON.stringify(value)}`;
    }

    has(value) {
        const str = String(value ?? "").trim();

        if (Util.empty(str)) {
            return false;
        }

        const escaped = JSON.stringify(str).slice(1, -1),
            bare = str.replace(AISourceLedger._trailingSlashRegex, "");

        return this.text.includes(escaped) || this.text.includes(bare);
    }

    static _trailingSlashRegex = /\/$/;
}

export default AISourceLedger;
