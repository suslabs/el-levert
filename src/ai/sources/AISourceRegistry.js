import AISource from "../../structures/ai/AISource.js";

import Util from "../../util/Util.js";

import AIError from "../../errors/AIError.js";

class AISourceRegistry {
    static select(definitions, names) {
        const unknown = names.filter(name => typeof definitions[name] === "undefined");

        if (!Util.empty(unknown)) {
            throw new AIError(`Unknown AI sources: ${unknown.join(", ")}`, unknown);
        }

        return Object.fromEntries(names.map(name => [name, definitions[name]]));
    }

    constructor(http, timeout) {
        this.http = http;
        this.timeout = timeout;

        this.sources = new Map();
    }

    async load(definitions) {
        for (const [name, definition] of Object.entries(definitions)) {
            const source = new AISource({ name, ...definition });
            this.sources.set(source.type, await source.load(this.http, this.timeout));
        }
    }

    get(type) {
        return this.sources.get(type) ?? null;
    }
}

export default AISourceRegistry;
