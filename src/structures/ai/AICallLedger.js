import Util from "../../util/Util.js";
import AIUtil from "../../util/ai/AIUtil.js";

class AICallLedger {
    static repeatNote = "You already made this exact call; this is its result. Use it instead of calling again.";
    static budgetNote =
        "You've used this tool as many times as allowed for one answer. Answer with what you have, or say what you couldn't find.";

    constructor(tools) {
        this.tools = tools;

        this.results = new Map();
        this.counts = new Map();

        this.found = false;
    }

    // tools ran, but every one came back empty or failed
    get foundNothing() {
        return !Util.empty(this.results) && !this.found;
    }

    hasCalled(name) {
        return this.counts.has(name);
    }

    async run(call, execute) {
        const key = AICallLedger._getKey(call);

        if (this.results.has(key)) {
            return { repeated: true, note: AICallLedger.repeatNote, result: await this.results.get(key) };
        }

        const count = this.counts.get(call.name) ?? 0;

        if (count >= this.tools.getMaxCalls(call.name)) {
            return { error: AICallLedger.budgetNote };
        }

        this.counts.set(call.name, count + 1);

        const pending = execute();
        this.results.set(key, pending);

        const res = await pending;
        this.found ||= AIUtil.hasFindings(res);

        return res;
    }

    // Search queries are case-insensitive. Code, paths, and other arguments keep their exact values.
    static _normalize(key, value) {
        return key === "query" && typeof value === "string" ? AIUtil.normalizeQuery(value) : value;
    }

    static _getKey(call) {
        const args = Object.keys(call.args)
            .sort()
            .map(key => [key, AICallLedger._normalize(key, call.args[key])]);

        return `${call.name}:${JSON.stringify(args)}`;
    }
}

export default AICallLedger;
