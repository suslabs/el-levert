import AISource from "../../structures/ai/AISource.js";

import { getLogger } from "../../LevertClient.js";

class AISourceRegistry {
    constructor(http, timeout) {
        this.http = http;
        this.timeout = timeout;

        this.sources = new Map();
    }

    async load(definitions) {
        const sources = Object.entries(definitions)
            .map(([name, definition]) => new AISource({ name, ...definition }))
            .sort((a, b) => b.priority - a.priority);

        for (const source of sources) {
            if (!this.sources.has(source.type)) {
                await this._loadSource(source);
            }
        }
    }

    get(type) {
        return this.sources.get(type) ?? null;
    }

    async _loadSource(source) {
        try {
            this.sources.set(source.type, await source.load(this.http, this.timeout));
        } catch (err) {
            getLogger().error(`Couldn't load the ${source.name} AI source:`, err);
        }
    }
}

export default AISourceRegistry;
