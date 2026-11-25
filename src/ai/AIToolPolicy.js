import AIToolScopes from "../structures/ai/AIToolScopes.js";

import Util from "../util/Util.js";

class AIToolPolicy {
    constructor(scope = AIToolScopes.auto, required = [], excluded = [], allowed = []) {
        this._scope = scope;
        this._required = required;
        this._excluded = new Set(excluded);
        this._allowed = new Set(allowed);
    }

    get isExplicit() {
        return this._scope !== AIToolScopes.auto || !Util.empty(this._required) || !Util.empty(this._excluded);
    }

    allows(name) {
        return (
            this._scope !== AIToolScopes.none &&
            !this._excluded.has(name) &&
            (this._scope === AIToolScopes.auto || this._allowed.has(name))
        );
    }

    pending(available, calls) {
        return this._required.filter(name => available.includes(name) && !calls.hasCalled(name));
    }

    describe(available, calls, final) {
        if (!this.isExplicit) {
            return "";
        }

        const lines = [];

        switch (this._scope) {
            case AIToolScopes.none:
                lines.push("The user asked for an answer without tools.");
                break;
            case AIToolScopes.only:
                lines.push(`Use only these permitted tools: ${available.join(", ") || "none available"}.`);
                break;
        }

        if (!Util.empty(this._excluded)) {
            lines.push(
                `Do not use these tools or replace them with another way of accessing the prohibited source: ${Array.from(this._excluded).join(", ")}.`
            );
        }

        const unavailable = this._required.filter(name => !available.includes(name));

        if (!Util.empty(unavailable)) {
            lines.push(
                `These requested tools are unavailable for this question: ${unavailable.join(", ")}. Tell the user.`
            );
        }

        const pending = this.pending(available, calls);

        if (!Util.empty(pending)) {
            if (final) {
                lines.push(
                    `These requested tools did not run: ${pending.join(", ")}. Tell the user and do not claim to have used them.`
                );
            } else {
                lines.push(
                    `Before answering, call these requested tools: ${pending.join(", ")}. Use permitted tools to find missing arguments such as IDs. Do not make up arguments or results.`
                );
            }
        }

        return lines.join("\n");
    }
}

export default AIToolPolicy;
