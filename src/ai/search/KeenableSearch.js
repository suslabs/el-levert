import SearchBackend from "./SearchBackend.js";

class KeenableSearch extends SearchBackend {
    static $name = "keenable";
    static keyName = "keenableKey";
    static url = "https://api.keenable.ai/v1/search";

    constructor(http, key) {
        super(http);
        this._key = key;
    }

    async search(query, limit, timeout) {
        const results = await this.searchJson(
            KeenableSearch.url,
            { "x-api-key": this._key },
            { query, max_results: limit, snippet_max_length: KeenableSearch.maxSnippetLength },
            timeout
        );

        return results.map(result => this.formatResult(result.title, result.url, result.snippet ?? ""));
    }
}

export default KeenableSearch;
