import SearchBackend from "./SearchBackend.js";

import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

class TavilySearch extends SearchBackend {
    static $name = "tavily";
    static needsKey = true;

    // Tavily's snippets are already the relevant extract of the page, so keep more of them
    static maxSnippetLength = 1000;

    static url = "https://api.tavily.com/search";
    static depth = "basic";

    // tries each key in turn, so a used-up or rejected key falls through to the next
    async search(query, limit, timeout) {
        let lastError = null;

        for (const key of this.keys) {
            try {
                return await this._search(key, query, limit, timeout);
            } catch (err) {
                if (err.name !== "AIError") {
                    throw err;
                }

                lastError = err;
            }
        }

        throw lastError;
    }

    async _search(key, query, limit, timeout) {
        const res = await this.http.request({
            url: TavilySearch.url,
            method: "post",
            headers: { authorization: `Bearer ${key}` },
            data: { query, max_results: limit, search_depth: TavilySearch.depth },
            responseType: "json",
            timeout,
            validateStatus: () => true
        });

        if (!isSuccessStatus(res.status)) {
            throw new AIError(`Tavily search failed (HTTP ${res.status})`, res.status);
        }

        return res.data.results.map(result => this.formatResult(result.title, result.url, result.content ?? ""));
    }
}

export default TavilySearch;
