import { describe, expect, test } from "vitest";

import WikiClient from "../../../src/ai/sources/WikiClient.js";
import Sources from "../../../src/ai/sources/Sources.js";

import Util from "../../../src/util/Util.js";

function createWiki(data) {
    const requests = [];

    const http = {
        request: async config => {
            requests.push(config);
            return { data: { query: data } };
        }
    };

    return { requests, wiki: new WikiClient(http, Sources.wikipedia.options) };
}

describe("WikiClient", () => {
    test("searches in the chosen language with a user agent", async () => {
        const { requests, wiki } = createWiki({
            search: [{ title: "Steel Mill", snippet: 'A <span class="m">steel</span> mill' }]
        });

        const results = await wiki.search("steel", { language: "de", limit: 3, timeout: 1000 });

        expect(Util.first(requests)).toMatchObject({
            url: "https://de.wikipedia.org/w/api.php",
            params: {
                action: "query",
                list: "prefixsearch|search",
                pssearch: "steel",
                psprofile: "fuzzy",
                pslimit: 3,
                srsearch: "steel",
                srlimit: 3
            },
            headers: { "user-agent": Sources.wikipedia.options.userAgent }
        });

        expect(results).toEqual([
            { title: "Steel Mill", url: "https://de.wikipedia.org/wiki/Steel_Mill", snippet: "A steel mill" }
        ]);
    });

    test("puts typo-tolerant title matches before full-text results without duplicates", async () => {
        const { wiki } = createWiki({
            prefixsearch: [{ title: "Tung Tung Tung Sahur" }, { title: "Tung Tung Tung Sahur Runner" }],
            search: [
                { title: "Comparison of Standard Chinese transcription systems", snippet: "shau <b>shaur</b>" },
                { title: "Tung Tung Tung Sahur", snippet: "duplicate" }
            ]
        });

        const results = await wiki.search("tung tung tung shaur", { limit: 3 });

        expect(results.map(result => [result.title, result.snippet])).toEqual([
            ["Tung Tung Tung Sahur", ""],
            ["Tung Tung Tung Sahur Runner", ""],
            ["Comparison of Standard Chinese transcription systems", "shau shaur"]
        ]);
    });

    test("reads articles and reports missing ones", async () => {
        const { wiki } = createWiki({ pages: { 1: { title: "Steel", extract: "Steel is an alloy." } } });

        await expect(wiki.read("steel", { language: "en", timeout: 1000 })).resolves.toEqual({
            title: "Steel",
            url: "https://en.wikipedia.org/wiki/Steel",
            text: "Steel is an alloy."
        });

        const { wiki: empty } = createWiki({ pages: { "-1": { title: "Nope", missing: "" } } });
        await expect(empty.read("Nope", { language: "en", timeout: 1000 })).rejects.toThrow(
            "Wikipedia article not found"
        );
    });

    test("defaults the language and rejects invalid ones", () => {
        const { wiki } = createWiki({});

        expect(wiki.getLanguage()).toBe("en");
        expect(wiki.getLanguage("PT-br")).toBe("pt-br");
        expect(() => wiki.getLanguage("../x")).toThrow('Invalid Wikipedia language "../x"');
    });
});
