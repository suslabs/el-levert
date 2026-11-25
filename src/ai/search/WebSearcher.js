import Backends from "./index.js";

import { getLogger } from "../../LevertClient.js";

import ObjectUtil from "../../util/ObjectUtil.js";

// runs a web search on the first backend that works: Tavily when it has a key, then DuckDuckGo
class WebSearcher {
    static fallbackErrors = new Set(["AIError", "AxiosError", "CanceledError"]);

    constructor(http, keys) {
        keys = ObjectUtil.guaranteeObject(keys);

        this.backends = Object.values(Backends)
            .map(Backend => new Backend(http, keys[Backend.$name] ?? []))
            .filter(backend => backend.enabled);
    }

    async search(query, limit, timeout) {
        let lastError = null;

        for (const backend of this.backends) {
            try {
                return { query, results: await backend.search(query, limit, timeout) };
            } catch (err) {
                if (!WebSearcher.fallbackErrors.has(err.name)) {
                    throw err;
                }

                getLogger().warn(`Web search on ${backend.name} failed: ${err.message}`);
                lastError = err;
            }
        }

        throw lastError;
    }
}

export default WebSearcher;
