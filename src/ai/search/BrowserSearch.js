import SearchBackend from "./SearchBackend.js";

import Util from "../../util/Util.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";

class BrowserSearch extends SearchBackend {
    static $name = "browser";

    static url = "https://duckduckgo.com/";
    static resultSelector = "article[data-testid='result']";

    get enabled() {
        return this.browser !== null;
    }

    async search(query, limit, timeout) {
        const url = `${BrowserSearch.url}?${new URLSearchParams({ q: query, ia: "web" })}`;

        const deadline = Date.now() + timeout;

        const results = await this.browser.withPage(async page => {
            const remaining = Math.max(1, deadline - Date.now()),
                signal = AbortSignal.timeout(remaining);

            await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining });
            await page.waitForSelector(BrowserSearch.resultSelector, { signal });

            // runs inside the page, so it can't use anything from this module
            return await page.$$eval(BrowserSearch.resultSelector, articles =>
                articles.map(article => {
                    const link = article.querySelector("a[data-testid='result-title-a']"),
                        snippet = article.querySelector("[data-result='snippet']");

                    return { title: link?.innerText ?? "", url: link?.href ?? "", snippet: snippet?.innerText ?? "" };
                })
            );
        }, timeout);

        const valid = results.filter(result => HTTPUtil.getHost(result.url) !== null);

        if (Util.empty(valid)) {
            throw new AIError("The browser search returned no results");
        }

        return valid
            .slice(0, limit)
            .map(result => this.formatResult(result.title.trim(), result.url, result.snippet.trim()));
    }
}

export default BrowserSearch;
