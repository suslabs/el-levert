import Util from "../../util/Util.js";
import HTMLUtil from "../../util/misc/HTMLUtil.js";
import HTTPUtil from "../../util/vm/HTTPUtil.js";
import { isSuccessStatus } from "../../util/misc/HttpStatusCodes.js";

import AIError from "../../errors/AIError.js";

function toPage(data, contentType, isHtml, url) {
    if (contentType.startsWith("image/")) {
        throw new AIError("This URL is an image; use inspect_image");
    } else if (isHtml) {
        const page = HTMLUtil.toText(data),
            images = HTMLUtil.extractImages(data, url);

        return Util.empty(images) ? page : { ...page, images };
    }

    return { title: "", text: String(data) };
}

// Evaluated in Chromium, so this function must be self-contained.
function pageText(minLength) {
    const doc = globalThis.document,
        text = (doc.querySelector("main, article") ?? doc.body)?.innerText.trim() ?? "";

    if (text.length < minLength) {
        return null;
    }

    const urls = new Set(),
        meta = doc.querySelectorAll("meta[property='og:image'], meta[name='twitter:image']");

    for (const el of meta) {
        const content = el.getAttribute("content");

        if (content && /^https?:\/\//i.test(content) && !/\.svg(?:[?#]|$)/i.test(content)) {
            urls.add(content);
        }
    }

    const root = doc.querySelector("main, article") ?? doc.body;

    for (const img of root?.querySelectorAll("img") ?? []) {
        const src = img.currentSrc || img.src;

        if (!src || !/^https?:\/\//i.test(src) || /\.svg(?:[?#]|$)/i.test(src)) {
            continue;
        }

        if (img.naturalWidth > 0 && img.naturalWidth < 64 && img.naturalHeight > 0 && img.naturalHeight < 64) {
            continue;
        }

        urls.add(src);

        if (urls.size >= 8) {
            break;
        }
    }

    const images = Array.from(urls);
    return { title: doc.title, text, ...(images.slice(0, 1).join("") ? { images } : {}) };
}

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

        const deadline = Util.createDeadline(timeout);

        const res = await this.http.request({
            url,
            headers: { accept: PageReader.accept },
            responseType: "text",
            timeout,
            validateStatus: () => true
        });

        const contentType = HTTPUtil.getContentType(res.headers),
            isHtml = contentType.includes("html");

        const original = isSuccessStatus(res.status) ? toPage(res.data, contentType, isHtml, url) : null;

        if (original !== null && (!isHtml || original.text.length >= PageReader.minTextLength)) {
            return original;
        }

        const remaining = Util.getRemainingTime(deadline);

        if (this.browser !== null && remaining !== 0) {
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

    static async _readRendered(page, timeout) {
        try {
            const content = await page.waitForFunction(pageText, { timeout }, PageReader.minTextLength);

            try {
                return await content.jsonValue();
            } finally {
                await content.dispose();
            }
        } catch (err) {
            if (err.name !== "TimeoutError") {
                throw err;
            }

            return await page.evaluate(pageText, 0);
        }
    }

    async _render(url, timeout) {
        const deadline = Util.createDeadline(timeout);

        return await this.browser.withPage(async page => {
            const remaining = Util.getRemainingTime(deadline);

            if (remaining === 0) {
                throw new AIError("Timed out opening the page");
            }

            const res = await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: remaining === -1 ? 0 : remaining
            });

            if (res === null || HTTPUtil.getHost(res.url()) === null) {
                throw new AIError("The browser returned no HTTP page");
            } else if (!isSuccessStatus(res.status())) {
                throw new AIError(`HTTP ${res.status()}`, res.status());
            } else if (HTTPUtil.getContentType(res.headers()).startsWith("image/")) {
                throw new AIError("This URL is an image; use inspect_image");
            }

            const wait = Util.getRemainingTime(deadline, PageReader.renderWait, 1);
            return await PageReader._readRendered(page, wait);
        }, timeout);
    }
}

export default PageReader;
