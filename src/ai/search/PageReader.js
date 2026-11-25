import Util from "../../util/Util.js";
import HTMLUtil from "../../util/misc/HTMLUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

class PageReader {
    static accept = "text/html,text/plain,application/json;q=0.9,*/*;q=0.5";
    static minTextLength = 200;
    static renderWait = 2 / Util.durationSeconds.milli;

    constructor(http, browser) {
        this.http = http;
        this.browser = browser;
    }

    async read(url, timeout) {
        if (HTTPUtil.getHost(url) === null) {
            throw new AIError("Only absolute http(s) URLs are supported");
        }

        const deadline = Date.now() + timeout;

        const res = await this.http.request({
            url,
            headers: { accept: PageReader.accept },
            responseType: "text",
            timeout,
            validateStatus: () => true
        });

        const contentType = HTTPUtil.getContentType(res.headers),
            isHtml = contentType.includes("html");

        const original = isSuccessStatus(res.status) ? PageReader._toPage(res.data, contentType, isHtml) : null;

        if (original !== null && (!isHtml || original.text.length >= PageReader.minTextLength)) {
            return original;
        }

        const remaining = deadline - Date.now();

        if (this.browser !== null && remaining > 0) {
            try {
                const rendered = await this._render(url, remaining);

                if (original === null || rendered.text.length > original.text.length) {
                    return rendered;
                }
            } catch (err) {
                if (original === null || !(err instanceof AIError)) {
                    throw err;
                }
            }
        }

        if (original !== null) {
            return original;
        }

        throw new AIError(`HTTP ${res.status}`, res.status);
    }

    static _toPage(data, contentType, isHtml) {
        if (contentType.startsWith("image/")) {
            throw new AIError("This URL is an image; use inspect_image");
        } else if (isHtml) {
            return HTMLUtil.toText(data);
        }

        return { title: "", text: String(data) };
    }

    // Evaluated in Chromium, so this function must be self-contained.
    static _pageText(minLength) {
        const doc = globalThis.document;
        const text = (doc.querySelector("main, article") ?? doc.body)?.innerText.trim() ?? "";
        return text.length >= minLength ? { title: doc.title, text } : null;
    }

    static async _readRendered(page, timeout) {
        try {
            const content = await page.waitForFunction(PageReader._pageText, { timeout }, PageReader.minTextLength);

            try {
                return await content.jsonValue();
            } finally {
                await content.dispose();
            }
        } catch (err) {
            if (err.name !== "TimeoutError") {
                throw err;
            }

            return await page.evaluate(PageReader._pageText, 0);
        }
    }

    async _render(url, timeout) {
        const deadline = Date.now() + timeout;

        return await this.browser.withPage(async page => {
            const remaining = deadline - Date.now();

            if (remaining <= 0) {
                throw new AIError("Timed out opening the page");
            }

            const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: remaining });

            if (res === null || HTTPUtil.getHost(res.url()) === null) {
                throw new AIError("The browser returned no HTTP page");
            } else if (!isSuccessStatus(res.status())) {
                throw new AIError(`HTTP ${res.status()}`, res.status());
            } else if (HTTPUtil.getContentType(res.headers()).startsWith("image/")) {
                throw new AIError("This URL is an image; use inspect_image");
            }

            const wait = Math.max(1, Math.min(deadline - Date.now(), PageReader.renderWait));
            return await PageReader._readRendered(page, wait);
        }, timeout);
    }
}

export default PageReader;
