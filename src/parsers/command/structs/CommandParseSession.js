import Util from "../../../util/Util.js";
import ArrayUtil from "../../../util/ArrayUtil.js";

class CommandParseSession {
    constructor(context) {
        this.context = context;
        this.argsText = String(context.argsText ?? "");
        this.remainingText = this.argsText;
        this.argsIndex = 0;
        this.matchCache = new Map();
        this.results = new Map();
        this.issues = [];
    }

    get valid() {
        if (!Util.empty(this.issues)) {
            return false;
        }

        for (const result of this.results.values()) {
            if (!result.valid) {
                return false;
            }
        }

        return true;
    }

    addIssue(issue) {
        this.issues.push(issue);
    }

    addResult(result) {
        this.results.set(result.name, result);
    }

    applyNamedIssues() {
        const namedIssues = this.issues.filter(issue => typeof issue.ref?.name === "string");

        if (Util.empty(namedIssues)) {
            return;
        }

        const grouped = ArrayUtil.groupBy(namedIssues, issue => issue.ref.name);

        for (const [name, issues] of Object.entries(grouped)) {
            const result = this.results.get(name);

            if (typeof result === "undefined") {
                continue;
            }

            result.issues.push(...issues);
            result.valid = false;
        }
    }

    getSourceValue(from = "args") {
        if (from === "args") {
            return this.remainingText.trim();
        }

        if (this.results.has(from)) {
            return this.results.get(from).value;
        }

        return this.context[from];
    }

    getSourceText(from = "args") {
        return String(this.getSourceValue(from) ?? "");
    }

    getPatternMatch(pattern, from = "args") {
        let cache = this.matchCache.get(from);

        if (typeof cache === "undefined") {
            cache = new WeakMap();
            this.matchCache.set(from, cache);
        }

        const text = this.getSourceText(from),
            cached = cache.get(pattern);

        if (cached?.text === text) {
            return cached.match;
        }

        const lastIndex = pattern.lastIndex;
        pattern.lastIndex = 0;

        const match = pattern.exec(text);
        pattern.lastIndex = lastIndex;

        cache.set(pattern, {
            text,
            match
        });

        return match;
    }

    removeArgsRanges(ranges) {
        let text = this.remainingText;

        for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
            text = text.slice(0, start) + text.slice(end);
        }

        this.remainingText = text;
    }
}

export default CommandParseSession;
