import Util from "../../util/Util.js";

import AIError from "../../errors/AIError.js";

class SearchBackend {
    static maxSnippetLength = 300;

    constructor(http, keys) {
        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new AIError("Search backend must have a name");
        } else if (typeof this.search !== "function") {
            throw new AIError("Child class must have a search function");
        }

        this.http = http;
        this.keys = keys;
    }

    get name() {
        return this.constructor.$name;
    }

    // backends that need a key are skipped when none is configured
    get enabled() {
        return !this.constructor.needsKey || !Util.empty(this.keys);
    }

    formatResult(title, url, snippet) {
        return { title, url, snippet: Util.trimString(snippet, this.constructor.maxSnippetLength) };
    }
}

export default SearchBackend;
