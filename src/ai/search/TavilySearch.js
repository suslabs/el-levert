import SearchBackend from "./SearchBackend.js";

class TavilySearch extends SearchBackend {
    static $name = "tavily";
    static keyName = "tavilyKey";
    static url = "https://api.tavily.com/search";
    static maxSnippetLength = 1000;

    constructor(http, key) {
        super(http);
        this._key = key;
    }

    async search(query, limit, timeout) {
        const results = await this.searchJson(
            TavilySearch.url,
            { authorization: `Bearer ${this._key}` },
            { query, max_results: limit, search_depth: "basic" },
            timeout
        );

        return results.map(result => this.formatResult(result.title, result.url, result.content ?? ""));
    }
}

export default TavilySearch;
