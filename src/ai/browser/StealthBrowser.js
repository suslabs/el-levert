import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

import BrowserProxy from "./BrowserProxy.js";

import HTTPUtil from "../../util/vm/HTTPUtil.js";

import AIError from "../../errors/AIError.js";

puppeteer.use(StealthPlugin());

class StealthBrowser {
    static launchArgs = ["--disable-dev-shm-usage", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
    static viewport = { width: 1366, height: 900 };
    static skippedResources = new Set(["image", "media", "font"]);

    constructor(allowLocalhostRequests) {
        this._proxy = allowLocalhostRequests ? null : new BrowserProxy();
        this._launching = null;
        this._closed = false;
    }

    async withPage(callback, timeout) {
        try {
            const browser = await this._getBrowser(timeout);
            const context = await browser.createBrowserContext({ downloadBehavior: { policy: "deny" } });

            try {
                const page = await context.newPage();
                await StealthBrowser._preparePage(page);
                return await callback(page);
            } finally {
                if (browser.connected) {
                    await context.close();
                }
            }
        } catch (err) {
            if (err instanceof AIError) {
                throw err;
            }

            throw new AIError(err.message);
        }
    }

    async close() {
        this._closed = true;

        try {
            const browser = await this._launching?.catch(() => null);
            await browser?.close();
        } finally {
            await this._proxy?.close();
        }
    }

    static async _preparePage(page) {
        await page.setViewport(StealthBrowser.viewport);
        await page.setRequestInterception(true);

        page.on("request", request => {
            if (
                HTTPUtil.getHost(request.url()) === null ||
                StealthBrowser.skippedResources.has(request.resourceType())
            ) {
                return request.abort();
            }

            return request.continue();
        });
    }

    async _launch(timeout) {
        const args = [...StealthBrowser.launchArgs];

        if (this._proxy !== null) {
            const port = await this._proxy.start();
            args.push(`--proxy-server=http://127.0.0.1:${port}`, "--proxy-bypass-list=<-loopback>", "--disable-quic");
        }

        try {
            return await puppeteer.launch({ headless: true, args, timeout });
        } catch (err) {
            await this._proxy?.close();
            throw err;
        }
    }

    _getBrowser(timeout) {
        if (this._closed) {
            throw new AIError("The browser has been closed");
        }

        this._launching ??= this._launch(timeout).then(
            browser => {
                browser.once("disconnected", () => {
                    this._launching = null;
                });
                return browser;
            },
            err => {
                this._launching = null;
                throw err;
            }
        );

        return this._launching;
    }
}

export default StealthBrowser;
