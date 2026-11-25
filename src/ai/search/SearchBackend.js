import Util from "../../util/Util.js";

import AIError from "../../errors/AIError.js";

class SearchBackend {
    static maxSnippetLength = 300;

    constructor(http, browser) {
        const compName = this.constructor.$name;

        if (!Util.nonemptyString(compName)) {
            throw new AIError("Search backend must have a name");
        } else if (typeof this.search !== "function") {
            throw new AIError("Child class must have a search function");
        }

        this.http = http;
        this.browser = browser;
    }

    get name() {
        return this.constructor.$name;
    }

    formatResult(title, url, snippet) {
        return { title, url, snippet: Util.trimString(snippet, SearchBackend.maxSnippetLength) };
    }
}

export default SearchBackend;
