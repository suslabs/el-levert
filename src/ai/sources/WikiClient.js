import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import HTMLUtil from "../../util/misc/HTMLUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";

class WikiClient {
    static apiPath = "w/api.php";
    static articlePath = "wiki";

    static defaultLimit = 5;

    // title matches tolerate typos ("tung tung tung shaur" finds "Tung Tung Tung Sahur"),
    // full-text search covers descriptive queries
    static searchLists = "prefixsearch|search";
    static titleMatchProfile = "fuzzy";

    constructor(http, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.http = http;

        this.name = options.name;
        this.host = options.host;
        this.language = options.language;
        this.userAgent = options.userAgent;
    }

    getLanguage(language) {
        const lang = String(language ?? this.language).toLowerCase();

        if (!WikiClient._languageRegex.test(lang)) {
            throw new AIError(`Invalid ${this.name} language "${lang}"`);
        }

        return lang;
    }

    async search(query, options) {
        options = ObjectUtil.guaranteeObject(options);

        const language = options.language ?? this.language,
            limit = options.limit ?? WikiClient.defaultLimit;

        const timeout = options.timeout ?? 0;

        const data = await this._query(
            language,
            {
                list: WikiClient.searchLists,
                pssearch: query,
                psprofile: WikiClient.titleMatchProfile,
                pslimit: limit,
                srsearch: query,
                srlimit: limit
            },
            timeout
        );

        const results = [...(data.prefixsearch ?? []), ...(data.search ?? [])];

        return ArrayUtil.unique(results, result => result.title)
            .slice(0, limit)
            .map(result => ({
                title: result.title,
                url: this._getArticleUrl(result.title, language),
                snippet: HTMLUtil.stripTags(result.snippet ?? "")
            }));
    }

    async read(title, options) {
        options = ObjectUtil.guaranteeObject(options);

        const language = options.language ?? this.language;

        const timeout = options.timeout ?? 0;

        const data = await this._query(
            language,
            {
                prop: "extracts",
                explaintext: 1,
                redirects: 1,
                titles: title
            },
            timeout
        );

        const page = Util.first(Object.values(data.pages ?? {}));

        if (typeof page === "undefined" || typeof page.missing !== "undefined") {
            throw new AIError(`${this.name} article not found`);
        }

        return {
            title: page.title,
            url: this._getArticleUrl(page.title, language),
            text: page.extract ?? ""
        };
    }

    static _languageRegex = /^[a-z]{2,3}(-[a-z]+)?$/;

    _getUrl(language, ...path) {
        return HTTPUtil.joinUrl(`https://${language}.${this.host}`, ...path);
    }

    _getArticleUrl(title, language) {
        return this._getUrl(language, WikiClient.articlePath, encodeURIComponent(title.replaceAll(" ", "_")));
    }

    async _query(language, params, timeout) {
        const res = await this.http.request({
            url: this._getUrl(language, WikiClient.apiPath),
            params: { action: "query", format: "json", ...params },
            headers: { "user-agent": this.userAgent },
            responseType: "json",
            timeout
        });

        return res.data.query ?? {};
    }
}

export default WikiClient;
