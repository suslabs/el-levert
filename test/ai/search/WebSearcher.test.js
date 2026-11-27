import { describe, expect, test, vi } from "vitest";

import WebSearcher from "../../../src/ai/search/WebSearcher.js";

import AIError from "../../../src/errors/AIError.js";

const mockLogger = { warn: vi.fn(), error: vi.fn() };
vi.mock("../../../src/LevertClient.js", () => ({ getLogger: () => mockLogger }));

function createHttp(replies) {
    return { request: () => Promise.resolve(replies.shift()) };
}

describe("WebSearcher", () => {
    test("uses Keenable before the configured Tavily backup", async () => {
        const http = {
            request: vi
                .fn()
                .mockResolvedValueOnce({ status: 429 })
                .mockResolvedValueOnce({
                    status: 200,
                    data: { results: [{ title: "Page", url: "https://example.com/", content: "Tavily snippet" }] }
                })
        };
        const reader = { read: vi.fn().mockResolvedValue({ text: "Page text" }) };
        const searcher = new WebSearcher(http, null, reader, { keenable: ["test-keen"], tavily: ["test-tavily"] });

        await expect(searcher.search("test", 4, 1000)).resolves.toMatchObject({
            results: [{ title: "Page", snippet: "Tavily snippet", content: "Page text" }]
        });
        expect(http.request).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                url: "https://api.keenable.ai/v1/search",
                headers: { "x-api-key": "test-keen" },
                data: expect.objectContaining({ query: "test", max_results: 4 })
            })
        );
        expect(http.request).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                url: "https://api.tavily.com/search",
                headers: { authorization: "Bearer test-tavily" }
            })
        );
    });

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

    test("reports a DuckDuckGo bot check and skips cooled-down backends until cooldown resets", async () => {
        const searcher = new WebSearcher(createHttp([{ status: 202, data: "" }]), null, null);
        await expect(searcher.search("test", 5, 1000)).rejects.toThrow("bot check");
        await expect(searcher.search("test", 5, 1000)).rejects.toThrow("temporarily blocked or rate-limited");
        searcher.destroy();
    });

    test("logs missing-key startup errors when keyed search backends are unconfigured and skips logging when keys exist", () => {
        mockLogger.error.mockClear();

        const withoutKeys = new WebSearcher(createHttp([]), null, null);
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("keenableKey"));
        expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("tavilyKey"));
        withoutKeys.destroy();

        mockLogger.error.mockClear();

        const withKeys = new WebSearcher(createHttp([]), null, null, {
            keenable: ["keen-key"],
            tavily: ["tavily-key"]
        });
        expect(mockLogger.error).not.toHaveBeenCalled();
        withKeys.destroy();
    });

    test("moves to the next backend on empty results, AbortError, and cooled-down failures", async () => {
        const abortErr = new Error("aborted");
        abortErr.name = "AbortError";

        const http = {
            request: vi
                .fn()
                .mockResolvedValueOnce({ status: 200, data: { results: [] } })
                .mockRejectedValueOnce(abortErr)
                .mockResolvedValueOnce({
                    status: 200,
                    data: '<div class="result results_links"><a class="result__a" href="/relative">Skip</a><a class="result__snippet">Bad</a></div><div class="result results_links"><a class="result__a" href="https://example.org/ok">Valid</a><a class="result__snippet">Snippet</a></div>'
                })
        };
        const reader = { read: vi.fn().mockResolvedValue({ text: "Fallback text" }) };
        const searcher = new WebSearcher(http, null, reader, {
            keenable: ["keen-key"],
            tavily: ["tavily-key"]
        });

        await expect(searcher.search("test", 5, 1000)).resolves.toMatchObject({
            results: [{ title: "Valid", url: "https://example.org/ok", snippet: "Snippet", content: "Fallback text" }]
        });
        searcher.destroy();
    });

    test("collects unique images from Tavily search and read web pages", async () => {
        const http = {
            request: vi.fn().mockResolvedValue({
                status: 200,
                data: {
                    results: [{ title: "EBF", url: "https://example.com/ebf", content: "Guide" }],
                    images: [{ url: "https://example.com/top.png" }, "https://example.com/shared.png"]
                }
            })
        };
        const reader = {
            read: vi.fn().mockResolvedValue({
                title: "EBF",
                text: "Guide body",
                images: ["https://example.com/shared.png", "https://example.com/page.jpg"]
            })
        };
        const searcher = new WebSearcher(http, null, reader, { tavily: ["tavily-key"] });

        await expect(searcher.search("ebf diagram", 3, 1000)).resolves.toMatchObject({
            query: "ebf diagram",
            images: ["https://example.com/top.png", "https://example.com/shared.png", "https://example.com/page.jpg"],
            results: [
                {
                    title: "EBF",
                    url: "https://example.com/ebf",
                    content: "Guide body",
                    images: ["https://example.com/shared.png", "https://example.com/page.jpg"]
                }
            ]
        });

        expect(http.request).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ include_images: true })
            })
        );
        searcher.destroy();
    });
});
