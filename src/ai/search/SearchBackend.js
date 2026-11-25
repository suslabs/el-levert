import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

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
        return { title, url, snippet: Util.trimString(snippet, this.constructor.maxSnippetLength) };
    }

    async searchJson(url, headers, data, timeout) {
        const res = await this.http.request({
            url,
            method: "post",
            headers,
            data,
            responseType: "json",
            maxRedirects: 0,
            timeout,
            validateStatus: () => true
        });

        if (!isSuccessStatus(res.status)) {
            throw new AIError(`HTTP ${res.status}`, res.status);
        }

        return ArrayUtil.guaranteeArray(res.data?.results)
            .filter(result => typeof result?.url === "string" && HTTPUtil.getHost(result.url) !== null)
            .slice(0, data.max_results);
    }
}

export default SearchBackend;
