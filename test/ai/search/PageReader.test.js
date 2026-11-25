import { describe, expect, test, vi } from "vitest";

import PageReader from "../../../src/ai/search/PageReader.js";

import AIError from "../../../src/errors/AIError.js";

const url = "https://example.com/";

function readerFor(contentType, data, browser, status = 200) {
    const http = { request: vi.fn().mockResolvedValue({ status, headers: { "content-type": contentType }, data }) };
    return new PageReader(http, browser);
}

describe("PageReader", () => {
    test("keeps short responses from plain text endpoints as plain text", async () => {
        const browser = { withPage: vi.fn() };
        const reader = readerFor("text/plain", "Hello", browser);

        await expect(reader.read(url, 1000)).resolves.toEqual({ title: "", text: "Hello" });
        expect(browser.withPage).not.toHaveBeenCalled();
    });

    test("preserves readable HTML when Chromium fails to launch", async () => {
        const browser = { withPage: vi.fn().mockRejectedValue(new AIError("Chromium could not start")) };
        const reader = readerFor("text/html", "<title>Notes</title><main>A short note.</main>", browser);

        await expect(reader.read(url, 1000)).resolves.toEqual({ title: "Notes", text: "A short note." });
        expect(browser.withPage).toHaveBeenCalledOnce();
    });

    test("reads rendered text when HTTP gets blocked", async () => {
        const rendered = { title: "Rendered", text: "This came from the rendered page." };
        const page = {
            goto: vi.fn().mockResolvedValue({ status: () => 200, url: () => url, headers: () => ({}) }),
            waitForFunction: vi
                .fn()
                .mockResolvedValue({ jsonValue: vi.fn().mockResolvedValue(rendered), dispose: vi.fn() })
        };
        const browser = { withPage: callback => callback(page) };
        const reader = readerFor("text/html", "Blocked", browser, 403);

        await expect(reader.read(url, 1000)).resolves.toEqual(rendered);
        expect(page.goto).toHaveBeenCalledWith(url, expect.objectContaining({ waitUntil: "domcontentloaded" }));
    });

    test("rejects images without opening Chromium", async () => {
        const browser = { withPage: vi.fn() };
        const reader = readerFor("image/png", "", browser);

        await expect(reader.read(url, 1000)).rejects.toThrow("use inspect_image");
        expect(browser.withPage).not.toHaveBeenCalled();
    });
});
