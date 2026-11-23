import Util from "../../util/Util.js";
import HtmlUtil from "../../util/misc/HtmlUtil.js";

import AIError from "../../errors/AIError.js";

class WikiClient {
    static apiPath = "w/api.php";
    static articlePath = "wiki";

    constructor(http, options) {
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
        const data = await this._query(
            options.language,
            {
                list: "search",
                srsearch: query,
                srlimit: options.limit
            },
            options.timeout
        );

        return (data.search ?? []).map(result => ({
            title: result.title,
            url: this._getArticleUrl(result.title, options.language),
            snippet: HtmlUtil.stripTags(result.snippet)
        }));
    }

    async read(title, options) {
        const data = await this._query(
            options.language,
            {
                prop: "extracts",
                explaintext: 1,
                redirects: 1,
                titles: title
            },
            options.timeout
        );

        const page = Util.first(Object.values(data.pages ?? {}));

        if (typeof page === "undefined" || typeof page.missing !== "undefined") {
            throw new AIError(`${this.name} article not found`);
        }

        return {
            title: page.title,
            url: this._getArticleUrl(page.title, options.language),
            text: page.extract ?? ""
        };
    }

    static _languageRegex = /^[a-z]{2,3}(-[a-z]+)?$/;

    _getUrl(language, path) {
        return `https://${language}.${this.host}/${path}`;
    }

    _getArticleUrl(title, language) {
        const path = encodeURIComponent(title.replaceAll(" ", "_"));
        return this._getUrl(language, `${WikiClient.articlePath}/${path}`);
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
