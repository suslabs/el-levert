import Util from "../util/Util.js";
import HtmlUtil from "../util/misc/HtmlUtil.js";
import { isSuccessStatus } from "../util/misc/HttpStatusCodes.js";

import AIError from "../errors/AIError.js";

class WebSearcher {
    static userAgent =
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

    static duckDuckGoUrl = "https://html.duckduckgo.com/html/";
    static wikipediaApiUrl = "https://en.wikipedia.org/w/api.php";
    static wikipediaPageUrl = "https://en.wikipedia.org/wiki/";

    static maxSnippetLength = 300;

    constructor(http) {
        this.http = http;
    }

    async search(query, limit, timeout) {
        const errors = [];

        for (const [engine, searchFunc] of this._getEngines()) {
            try {
                const results = await searchFunc(query, limit, timeout);

                if (!Util.empty(results)) {
                    return { engine, query, results };
                }

                errors.push(`${engine}: no results`);
            } catch (err) {
                errors.push(`${engine}: ${Util.getErrorMessage(err)}`);
            }
        }

        return { query, results: [], errors };
    }

    static _resultSplitRegex = /class="result results_links/;
    static _resultLinkRegex = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
    static _resultSnippetRegex = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/;
    static _redirectParamRegex = /[?&]uddg=([^&]+)/;
    static _adPath = "/y.js?";

    _getEngines() {
        return [
            ["duckduckgo", this._searchDuckDuckGo.bind(this)],
            ["wikipedia", this._searchWikipedia.bind(this)]
        ];
    }

    async _searchDuckDuckGo(query, limit, timeout) {
        const res = await this.http.request({
            url: WebSearcher.duckDuckGoUrl,
            params: { q: query },
            headers: { "user-agent": WebSearcher.userAgent, accept: "text/html" },
            responseType: "text",
            timeout,
            validateStatus: () => true
        });

        if (!isSuccessStatus(res.status)) {
            throw new AIError(`HTTP ${res.status}`, res.status);
        }

        return String(res.data)
            .split(WebSearcher._resultSplitRegex)
            .slice(1)
            .map(block => this._parseDuckDuckGoResult(block))
            .filter(result => result !== null)
            .slice(0, limit);
    }

    _parseDuckDuckGoResult(block) {
        const link = block.match(WebSearcher._resultLinkRegex);

        if (link === null) {
            return null;
        }

        const href = HtmlUtil.decodeEntities(link[1]);

        if (href.includes(WebSearcher._adPath)) {
            return null;
        }

        const snippet = block.match(WebSearcher._resultSnippetRegex);

        return {
            title: HtmlUtil.stripTags(link[2]),
            url: this._resolveRedirect(href),
            snippet:
                snippet === null ? "" : Util.trimString(HtmlUtil.stripTags(snippet[1]), WebSearcher.maxSnippetLength)
        };
    }

    _resolveRedirect(href) {
        const redirect = href.match(WebSearcher._redirectParamRegex),
            url = redirect === null ? href : decodeURIComponent(redirect[1]);

        return url.startsWith("//") ? `https:${url}` : url;
    }

    async _searchWikipedia(query, limit, timeout) {
        const res = await this.http.request({
            url: WebSearcher.wikipediaApiUrl,
            params: {
                action: "query",
                list: "search",
                srsearch: query,
                srlimit: limit,
                format: "json"
            },
            responseType: "json",
            timeout
        });

        return (res.data.query?.search ?? []).map(result => ({
            title: result.title,
            url: WebSearcher.wikipediaPageUrl + encodeURIComponent(result.title.replaceAll(" ", "_")),
            snippet: HtmlUtil.stripTags(result.snippet)
        }));
    }
}

export default WebSearcher;
