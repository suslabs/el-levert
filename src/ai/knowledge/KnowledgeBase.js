import KnowledgeParser from "./KnowledgeParser.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import BM25Index from "../../util/search/BM25Index.js";

import AIError from "../../errors/AIError.js";

class KnowledgeBase {
    static fieldWeights = {
        title: 3,
        keywords: 2,
        text: 1
    };

    constructor(http, sources, timeout) {
        this.http = http;
        this.sources = sources;
        this.timeout = timeout;

        this.indexes = new Map();
        this.entries = new Map();
    }

    get kinds() {
        return Array.from(this.indexes.keys());
    }

    async load() {
        for (const source of this.sources) {
            const entries = KnowledgeParser.parse(source.format, await this._fetchRaw(source), source.kind);
            this._addEntries(source.kind, entries);

            getLogger().info(`Loaded ${entries.length} AI ${source.kind} entries.`);
        }
    }

    search(query, kind, limit) {
        return this.indexes.get(kind)?.search(query, limit) ?? [];
    }

    get(id) {
        return this.entries.get(String(id).toLowerCase()) ?? null;
    }

    static _codeblockRegex = /^```(?:json)?\s*|\s*```$/g;

    async _fetchRaw(source) {
        if (Util.nonemptyString(source.tag)) {
            return await this._fetchTag(source.tag);
        }

        const res = await this.http.request({
            url: source.url,
            responseType: "json",
            timeout: this.timeout
        });

        return res.data;
    }

    async _fetchTag(name) {
        const tag = await getClient().tagManager.fetch(name);

        if (tag === null) {
            throw new AIError("Knowledge source tag doesn't exist", name);
        }

        return JSON.parse(tag.body.replace(KnowledgeBase._codeblockRegex, ""));
    }

    _addEntries(kind, entries) {
        if (!this.indexes.has(kind)) {
            this.indexes.set(kind, new BM25Index(KnowledgeBase.fieldWeights));
        }

        const index = this.indexes.get(kind);

        for (const entry of entries) {
            index.add(entry);
            this.entries.set(entry.id.toLowerCase(), entry);
        }
    }
}

export default KnowledgeBase;
