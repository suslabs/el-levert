import PackSource from "./PackSource.js";
import QuestbookParser from "./QuestbookParser.js";

import { getLogger } from "../../LevertClient.js";

import BM25Index from "../../util/search/BM25Index.js";

import AIError from "../../errors/AIError.js";

class Questbook extends PackSource {
    static fieldWeights = {
        title: 3,
        keywords: 2,
        text: 1
    };

    constructor(http, options, timeout) {
        super(http, options);

        this.timeout = timeout;

        this.urls = options.urls;
        this.books = new Map();
    }

    async load() {
        for (const [mode, url] of Object.entries(this.urls)) {
            const res = await this.http.request({ url, responseType: "json", timeout: this.timeout }),
                quests = QuestbookParser.parse(res.data);

            this.books.set(mode, Questbook._createBook(quests));
            getLogger().info(`Loaded ${quests.length} ${mode} quests.`);
        }
    }

    search(query, mode, limit) {
        return this._getBook(mode)
            .index.search(query, limit)
            .map(res => res.doc);
    }

    get(id, mode) {
        return this._getBook(mode).quests.get(String(id)) ?? null;
    }

    static _createBook(quests) {
        const index = new BM25Index(Questbook.fieldWeights);
        quests.forEach(quest => index.add(quest));

        return { index, quests: new Map(quests.map(quest => [quest.id, quest])) };
    }

    _getBook(mode) {
        const book = this.books.get(mode);

        if (typeof book === "undefined") {
            throw new AIError(`There's no ${mode} questbook`);
        }

        return book;
    }
}

export default Questbook;
