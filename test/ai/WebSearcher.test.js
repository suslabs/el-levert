import { describe, expect, test } from "vitest";

import WebSearcher from "../../src/ai/WebSearcher.js";
import SearchWikipediaTool from "../../src/ai/tools/web/SearchWikipediaTool.js";

import Util from "../../src/util/Util.js";

function createSearcher() {
    const requests = [];

    const http = {
        request: async config => {
            requests.push(config);
            return {
                data: { query: { search: [{ title: "Steel Mill", snippet: 'A <span class="m">steel</span> mill' }] } }
            };
        }
    };

    return { requests, searcher: new WebSearcher(http) };
}

describe("WebSearcher", () => {
    test("searches Wikipedia in the chosen language", async () => {
        const { requests, searcher } = createSearcher();

        const results = await searcher.searchWikipedia("steel", 3, 1000, "de");

        expect(Util.first(requests)).toMatchObject({
            url: "https://de.wikipedia.org/w/api.php",
            params: { list: "search", srsearch: "steel", srlimit: 3 }
        });

        expect(results).toEqual([
            { title: "Steel Mill", url: "https://de.wikipedia.org/wiki/Steel_Mill", snippet: "A steel mill" }
        ]);
    });

    test("the search_wikipedia tool defaults to English and rejects bad languages", async () => {
        const { requests, searcher } = createSearcher();

        const tool = new SearchWikipediaTool({ webSearcher: searcher, maxToolOutput: 4000 }),
            session = { toolTimeout: () => 1000, logError: () => {} };

        const out = await tool.execute({ query: "steel" }, session);

        expect(out).toMatchObject({ query: "steel", language: "en" });
        expect(Util.first(requests).url).toBe("https://en.wikipedia.org/w/api.php");

        await expect(tool.execute({ query: "steel", language: "../x" }, session)).resolves.toEqual({
            error: 'Invalid Wikipedia language "../x"'
        });
        await expect(tool.execute({ query: " " }, session)).resolves.toEqual({ error: "query is required" });
    });
});
