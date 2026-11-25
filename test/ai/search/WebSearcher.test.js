import { describe, expect, test, vi } from "vitest";

import WebSearcher from "../../../src/ai/search/WebSearcher.js";

import AIError from "../../../src/errors/AIError.js";

vi.mock("../../../src/LevertClient.js", () => ({ getLogger: () => ({ warn: vi.fn() }) }));

function createHttp(replies) {
    return { request: () => Promise.resolve(replies.shift()) };
}

describe("WebSearcher", () => {
    test("reads the top three search results and preserves the remaining snippets", async () => {
        const html = [1, 2, 3, 4]
            .map(
                i =>
                    `<div class="result results_links"><a class="result__a" href="https://example.com/${i}">Page ${i}</a><a class="result__snippet">Snippet</a></div>`
            )
            .join("");
        const reader = { read: url => Promise.resolve({ text: `Content ${url}` }) };
        const searcher = new WebSearcher(createHttp([{ status: 200, data: html }]), null, reader);
        const result = await searcher.search("test", 4, 1000);
        expect(result.results).toHaveLength(4);
        expect(result.results[0].content).toBe("Content https://example.com/1");
        expect(result.results[2].content).toBe("Content https://example.com/3");
        expect(result.results[3].content).toBeUndefined();
    });

    test("takes search results from Chromium before trying the HTTP backend", async () => {
        const page = {
            goto: vi.fn(),
            waitForSelector: vi.fn(),
            $$eval: (selector, read) =>
                read([
                    {
                        querySelector: selector =>
                            selector.startsWith("a")
                                ? { innerText: "Example", href: "https://example.com/" }
                                : { innerText: "A result" }
                    }
                ])
        };
        const browser = { withPage: callback => callback(page) };
        const reader = { read: vi.fn().mockResolvedValue({ text: "Example page text" }) };
        const http = { request: vi.fn() };
        const searcher = new WebSearcher(http, browser, reader);

        await expect(searcher.search("test query", 5, 1000)).resolves.toMatchObject({
            results: [
                { title: "Example", url: "https://example.com/", snippet: "A result", content: "Example page text" }
            ]
        });
        expect(page.goto).toHaveBeenCalledWith(expect.stringContaining("q=test+query"), expect.anything());
        expect(http.request).not.toHaveBeenCalled();
    });

    test("falls back to DuckDuckGo when the browser fails", async () => {
        const browser = {
            withPage: vi.fn().mockRejectedValue(new AIError("Browser failed"))
        };
        const html =
            '<div class="result results_links"><a class="result__a" href="https://example.com">Example</a><a class="result__snippet">Snippet</a></div>';
        const reader = {
            read: vi.fn().mockRejectedValue(new AIError("Page failed"))
        };
        const searcher = new WebSearcher(createHttp([{ status: 200, data: html }]), browser, reader);
        const result = await searcher.search("test", 5, 1000);
        expect(result.results[0]).toMatchObject({ title: "Example", readError: "Page failed" });
    });

    test("reports a DuckDuckGo bot check", async () => {
        const searcher = new WebSearcher(createHttp([{ status: 202, data: "" }]), null, null);
        await expect(searcher.search("test", 5, 1000)).rejects.toThrow("bot check");
    });
});
