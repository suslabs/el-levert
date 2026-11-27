import SearchBackend from "./SearchBackend.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

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
        const res = await this.request({
            url: TavilySearch.url,
            method: "post",
            headers: { authorization: `Bearer ${this._key}` },
            data: { query, max_results: limit, search_depth: "basic", include_images: true },
            responseType: "json",
            maxRedirects: 0,
            timeout
        });

        const results = ArrayUtil.guaranteeArray(res.data?.results)
            .filter(result => typeof result?.url === "string" && HTTPUtil.getHost(result.url) !== null)
            .slice(0, limit)
            .map(result => this.formatResult(result.title, result.url, result.content ?? ""));

        const rawImages = ArrayUtil.guaranteeArray(res.data?.images)
            .map(entry => (typeof entry === "string" ? entry : entry?.url))
            .filter(url => typeof url === "string" && HTTPUtil.getHost(url) !== null);

        const images = ArrayUtil.unique(rawImages);
        return Util.empty(images) ? results : { results, images };
    }
}

export default TavilySearch;
