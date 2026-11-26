import BrowserSearch from "./BrowserSearch.js";
import DuckDuckGoSearch from "./DuckDuckGoSearch.js";
import KeenableSearch from "./KeenableSearch.js";
import TavilySearch from "./TavilySearch.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import LoggerUtil from "../../util/LoggerUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import QuotaLimiter from "../../util/misc/QuotaLimiter.js";
import { httpStatusCodes } from "../../util/misc/HttpStatusCodes.js";
import AIUtil from "../../util/ai/AIUtil.js";

import AIError from "../../errors/AIError.js";

class WebSearcher {
    static keyedBackends = [KeenableSearch, TavilySearch];

    static fallbackErrors = new Set(["AIError", "AxiosError", "CanceledError", "AbortError", "TimeoutError"]);
    static cooldownStatuses = new Set([
        httpStatusCodes.ACCEPTED,
        httpStatusCodes.UNAUTHORIZED,
        httpStatusCodes.FORBIDDEN,
        httpStatusCodes.TOO_MANY_REQUESTS,
        httpStatusCodes.SERVICE_UNAVAILABLE
    ]);

    static cooldownDelay = (30 * Util.durationSeconds.second) / Util.durationSeconds.milli;
    static maxCooldownDelay = (5 * Util.durationSeconds.minute) / Util.durationSeconds.milli;

    static readCount = 3;
    static readLength = 1500;

    constructor(http, browser, pageReader, keys) {
        keys = ObjectUtil.guaranteeObject(keys);

        this.pageReader = pageReader;
        this.quotas = new QuotaLimiter(WebSearcher.cooldownDelay, WebSearcher.maxCooldownDelay);

        this._entries = [];
        this.backends = [];

        this._addKeyedBackends(http, keys);

        if (browser !== null) {
            this._addBackend(new BrowserSearch(http, browser));
        }

        this._addBackend(new DuckDuckGoSearch(http));
    }

    get available() {
        return !Util.empty(this.backends);
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

    destroy() {
        this.quotas.destroy();
    }

    static _canFallBack(err) {
        return WebSearcher.fallbackErrors.has(err.name);
    }

    static _getFailureInfo(err) {
        const status = err.ref?.status ?? err.response?.status ?? (typeof err.ref === "number" ? err.ref : null),
            retryDelay = err.ref?.retryDelay ?? null;

        return { status, retryDelay };
    }

    _addBackend(backend) {
        const id = `${backend.name}:${this._entries.length}`;

        this._entries.push({ id, backend });
        this.backends.push(backend);
    }

    _addKeyedBackends(http, keys) {
        for (const Backend of WebSearcher.keyedBackends) {
            const backendKeys = keys[Backend.$name] ?? [];

            if (Util.empty(backendKeys)) {
                getLogger().error(AIUtil.formatMissingKey(`"${Backend.$name}" web search backend`, Backend.keyName));
                continue;
            }

            for (const key of backendKeys) {
                this._addBackend(new Backend(http, key));
            }
        }
    }

    async _searchBackends(query, limit, deadline) {
        const candidates = this._entries.filter(entry => this.quotas.canRequest(entry.id));

        if (Util.empty(candidates)) {
            throw new AIError("All web search backends are temporarily blocked or rate-limited; try again later");
        }

        let lastError = null;

        for (const [i, entry] of candidates.entries()) {
            const remaining = Util.getRemainingTime(deadline);

            if (remaining === 0 && lastError !== null) {
                break;
            }

            const timeout = remaining === -1 ? -1 : Math.max(1, Math.ceil(remaining / (candidates.length - i))),
                release = this.quotas.acquire(entry.id);

            try {
                const results = await entry.backend.search(query, limit, timeout);

                release(true);

                if (!Util.empty(results) || i === candidates.length - 1) {
                    return results;
                }

                getLogger().warn(`Web search on ${entry.backend.name} returned no results.`);
                lastError ??= new AIError(`Web search on ${entry.backend.name} returned no results`);
            } catch (err) {
                release(false);

                const { status, retryDelay } = WebSearcher._getFailureInfo(err);

                if (status !== null && WebSearcher.cooldownStatuses.has(status)) {
                    this.quotas.limit(entry.id, retryDelay);
                }

                if (!WebSearcher._canFallBack(err)) {
                    throw err;
                }

                getLogger().warn(`Web search on ${entry.backend.name} failed (${LoggerUtil.formatErrorSummary(err)}).`);
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
