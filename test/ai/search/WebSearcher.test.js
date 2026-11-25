import { afterEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

const ddgResult = (url, title, snippet) =>
    `<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}">${title}</a><a class="result__snippet">${snippet}</a></div>`;

// answers each request with the next reply and records what was asked
function createHttp(replies) {
    const requests = [];

    return {
        requests,
        request: async config => {
            requests.push(config);
            return replies.shift();
        }
    };
}

async function createSearcher(http, keys) {
    runtime = await createRuntime({});

    const { default: WebSearcher } = await import("../../../src/ai/search/WebSearcher.js");
    return new WebSearcher(http, keys);
}

describe("WebSearcher", () => {
    test("searches Tavily when it has a key and formats its results", async () => {
        const http = createHttp([
            {
                status: 200,
                data: { results: [{ title: "Nomifactory", url: "https://github.com/x", content: "By Exaxxion" }] }
            }
        ]);

        const searcher = await createSearcher(http, { tavily: ["key-1"] });

        await expect(searcher.search("nomifactory", 5, 1000)).resolves.toEqual({
            query: "nomifactory",
            results: [{ title: "Nomifactory", url: "https://github.com/x", snippet: "By Exaxxion" }]
        });

        expect(http.requests[0]).toMatchObject({
            url: "https://api.tavily.com/search",
            method: "post",
            headers: { authorization: "Bearer key-1" },
            data: { query: "nomifactory", max_results: 5 }
        });
    });

    test("moves to the next Tavily key, then to DuckDuckGo when Tavily fails", async () => {
        const http = createHttp([
            { status: 401, data: {} },
            { status: 432, data: {} },
            { status: 200, data: ddgResult("https://example.test/a", "<b>A</b> page", "About &amp; more") }
        ]);

        const searcher = await createSearcher(http, { tavily: ["bad-key", "used-up-key"] });

        await expect(searcher.search("a", 5, 1000)).resolves.toEqual({
            query: "a",
            results: [{ title: "A page", url: "https://example.test/a", snippet: "About & more" }]
        });

        expect(http.requests.map(request => request.headers.authorization ?? request.url)).toEqual([
            "Bearer bad-key",
            "Bearer used-up-key",
            "https://html.duckduckgo.com/html/"
        ]);
    });

    test("uses only DuckDuckGo without a Tavily key and reports its bot check as an error", async () => {
        const http = createHttp([
            { status: 202, data: '<div class="anomaly-modal__mask"></div>' },
            { status: 200, data: '<div class="anomaly-modal__modal"></div>' }
        ]);

        const searcher = await createSearcher(http, {});

        expect(searcher.backends.map(backend => backend.name)).toEqual(["duckduckgo"]);
        await expect(searcher.search("a", 5, 1000)).rejects.toThrow("Web search is blocked right now");
        await expect(searcher.search("a", 5, 1000)).rejects.toThrow("Web search is blocked right now");
    });
});
