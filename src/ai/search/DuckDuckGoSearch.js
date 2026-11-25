import SearchBackend from "./SearchBackend.js";

import HTMLUtil from "../../util/misc/HTMLUtil.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

class DuckDuckGoSearch extends SearchBackend {
    static $name = "duckduckgo";

    static url = "https://html.duckduckgo.com/html/";
    static userAgent =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

    static blockedStatus = httpStatusCodes.ACCEPTED;
    static blockedMarker = "anomaly-modal";

    async search(query, limit, timeout) {
        const res = await this.request({
            url: DuckDuckGoSearch.url,
            params: { q: query },
            headers: { "user-agent": DuckDuckGoSearch.userAgent, accept: "text/html" },
            responseType: "text",
            timeout
        });

        const page = String(res.data);

        if (res.status === DuckDuckGoSearch.blockedStatus || page.includes(DuckDuckGoSearch.blockedMarker)) {
            throw new AIError("Web search is blocked right now (the search engine is showing a bot check)", res.status);
        }

        return page
            .split(DuckDuckGoSearch._resultSplitRegex)
            .slice(1)
            .map(block => this._parseResult(block))
            .filter(result => result !== null)
            .slice(0, limit);
    }

    static _resultSplitRegex = /class="result results_links/;
    static _resultLinkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
    static _resultSnippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
    static _redirectParamRegex = /[?&]uddg=([^&]+)/;
    static _adPath = "/y.js?";

    static _resolveRedirect(href) {
        const redirect = href.match(DuckDuckGoSearch._redirectParamRegex),
            url = redirect === null ? href : decodeURIComponent(redirect[1]);

        return url.startsWith("//") ? `https:${url}` : url;
    }

    _parseResult(block) {
        const link = block.match(DuckDuckGoSearch._resultLinkRegex);

        if (link === null) {
            return null;
        }

        const href = HTMLUtil.decodeEntities(link[1]);

        if (href.includes(DuckDuckGoSearch._adPath)) {
            return null;
        }

        const snippet = block.match(DuckDuckGoSearch._resultSnippetRegex);

        return this.formatResult(
            HTMLUtil.stripTags(link[2]),
            DuckDuckGoSearch._resolveRedirect(href),
            snippet === null ? "" : HTMLUtil.stripTags(snippet[1])
        );
    }
}

export default DuckDuckGoSearch;
