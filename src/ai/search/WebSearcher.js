import Backends from "./index.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

// searches with the first backend that works (the stealth browser, then plain DuckDuckGo),
// then reads the top results so the model gets their text, not just snippets
class WebSearcher {
    static fallbackErrors = new Set(["AIError", "AxiosError", "CanceledError", "TimeoutError"]);

    static readCount = 3;
    static readLength = 1500;

    constructor(http, browser, pageReader) {
        this.pageReader = pageReader;

        this.backends = Object.values(Backends)
            .map(Backend => new Backend(http, browser))
            .filter(backend => backend.enabled);
    }

    async search(query, limit, timeout) {
        const deadline = Date.now() + timeout;
        const results = await this._searchBackends(query, limit, deadline);

        const remaining = deadline - Date.now();
        return {
            query,
            results: await Promise.all(results.map((result, i) => this._readResult(result, i, remaining)))
        };
    }

    static _canFallBack(err) {
        return WebSearcher.fallbackErrors.has(err.name);
    }

    async _searchBackends(query, limit, deadline) {
        let lastError = null;

        for (const [i, backend] of this.backends.entries()) {
            const remaining = deadline - Date.now();

            if (remaining <= 0 && lastError !== null) {
                break;
            }

            // Leave time for the next backend if this one gets blocked.
            const timeout = Math.max(1, Math.ceil(remaining / (this.backends.length - i)));

            try {
                return await backend.search(query, limit, timeout);
            } catch (err) {
                if (!WebSearcher._canFallBack(err)) {
                    throw err;
                }

                getLogger().warn(`Web search on ${backend.name} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw lastError;
    }

    async _readResult(result, i, timeout) {
        if (i >= WebSearcher.readCount || timeout <= 0) {
            return result;
        }

        try {
            const page = await this.pageReader.read(result.url, timeout);
            return { ...result, content: Util.trimString(page.text, WebSearcher.readLength) };
        } catch (err) {
            if (!WebSearcher._canFallBack(err)) {
                throw err;
            }

            return { ...result, readError: err.message };
        }
    }
}

export default WebSearcher;
