import { describe, expect, test } from "vitest";

import WikiClient from "../../../src/ai/sources/WikiClient.js";
import Sources from "../../../src/ai/sources/Sources.js";
import SearchWikiTool from "../../../src/ai/tools/sources/wiki/SearchWikiTool.js";
import ReadWikiTool from "../../../src/ai/tools/sources/wiki/ReadWikiTool.js";

import AISourceTypes from "../../../src/structures/ai/AISourceTypes.js";

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

function createTool(Tool, wiki) {
    const manager = {
        maxToolOutput: 20000,
        sources: { get: type => (type === AISourceTypes.wiki ? wiki : null) }
    };

    return new Tool(manager);
}

const session = { toolTimeout: () => 1000, logError: () => {} };

describe("WikiClient", () => {
    test("searches in the chosen language with a user agent", async () => {
        const { requests, wiki } = createWiki({
            search: [{ title: "Steel Mill", snippet: 'A <span class="m">steel</span> mill' }]
        });

        const results = await wiki.search("steel", { language: "de", limit: 3, timeout: 1000 });

        expect(Util.first(requests)).toMatchObject({
            url: "https://de.wikipedia.org/w/api.php",
            params: { action: "query", list: "search", srsearch: "steel", srlimit: 3 },
            headers: { "user-agent": Sources.wikipedia.options.userAgent }
        });

        expect(results).toEqual([
            { title: "Steel Mill", url: "https://de.wikipedia.org/wiki/Steel_Mill", snippet: "A steel mill" }
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

describe("Wikipedia tools", () => {
    test("are only available when the source is on", () => {
        const { wiki } = createWiki({});

        expect(createTool(SearchWikiTool, wiki).isAvailable(session)).toBe(true);
        expect(createTool(ReadWikiTool, null).isAvailable(session)).toBe(false);
    });

    test("search_wikipedia validates its input", async () => {
        const { requests, wiki } = createWiki({ search: [] });
        const tool = createTool(SearchWikiTool, wiki);

        await expect(tool.execute({ query: "steel" }, session)).resolves.toEqual({
            query: "steel",
            language: "en",
            results: []
        });
        expect(Util.first(requests).params.srlimit).toBe(SearchWikiTool.defaultLimit);

        await expect(tool.execute({ query: "steel", language: "../x" }, session)).resolves.toEqual({
            error: 'Invalid Wikipedia language "../x"'
        });
        await expect(tool.execute({ query: " " }, session)).resolves.toEqual({ error: "query is required" });
    });

    test("read_wikipedia pages through the article and cites it", async () => {
        const text = "a".repeat(6000);

        const { wiki } = createWiki({ pages: { 1: { title: "Steel", extract: text } } });
        const tool = createTool(ReadWikiTool, wiki);

        const first = await tool.execute({ title: "Steel" }, session);

        expect(first).toMatchObject({
            source: "https://en.wikipedia.org/wiki/Steel",
            title: "Steel",
            offset: 0,
            nextOffset: 5000,
            totalChars: 6000
        });

        const rest = await tool.execute({ title: "Steel", offset: first.nextOffset }, session);

        expect(rest.text).toHaveLength(1000);
        expect(rest.nextOffset).toBeNull();

        await expect(tool.execute({ title: "" }, session)).resolves.toEqual({ error: "title is required" });
    });
});
