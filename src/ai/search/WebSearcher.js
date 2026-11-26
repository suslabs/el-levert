import BrowserSearch from "./BrowserSearch.js";
import DuckDuckGoSearch from "./DuckDuckGoSearch.js";
import KeenableSearch from "./KeenableSearch.js";
import TavilySearch from "./TavilySearch.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";

class WebSearcher {
    static fallbackErrors = new Set(["AIError", "AxiosError", "CanceledError", "TimeoutError"]);

    static readCount = 3;
    static readLength = 1500;

    constructor(http, browser, pageReader, keys) {
        keys = ObjectUtil.guaranteeObject(keys);

        this.pageReader = pageReader;
        this.backends = [KeenableSearch, TavilySearch].flatMap(Backend =>
            (keys[Backend.$name] ?? []).map(key => new Backend(http, key))
        );

        if (browser !== null) {
            this.backends.push(new BrowserSearch(http, browser));
        }

        this.backends.push(new DuckDuckGoSearch(http));
    }

    async search(query, limit, timeout) {
        const deadline = Util.createDeadline(timeout);

        const results = await this._searchBackends(query, limit, deadline),
            remaining = Util.getRemainingTime(deadline);

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
            const remaining = Util.getRemainingTime(deadline);

            if (remaining === 0 && lastError !== null) {
                break;
            }

            const timeout = remaining === -1 ? -1 : Math.max(1, Math.ceil(remaining / (this.backends.length - i)));

            try {
                return await backend.search(query, limit, timeout);
            } catch (err) {
                if (!WebSearcher._canFallBack(err)) {
                    throw err;
                }

                getLogger().warn(`Web search on ${backend.name} failed (${LoggerUtil.formatErrorSummary(err)}).`);
                lastError = err;
            }
        }

        throw lastError;
    }

    async _readResult(result, i, timeout) {
        if (i >= WebSearcher.readCount || timeout === 0) {
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
