import axios from "axios";

import Manager from "../Manager.js";
import Questbook from "../../structures/questbook/Questbook.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";

import QuestbookError from "../../errors/QuestbookError.js";

class QuestbookManager extends Manager {
    static $name = "questbookManager";
    static loadPriority = 3;

    static requestTimeout = 30 / Util.durationSeconds.milli;

    constructor(enabled, configs) {
        super(enabled);

        this.configs = ObjectUtil.guaranteeObject(configs);
        this.books = new Map();
    }

    get names() {
        return Array.from(this.books.keys());
    }

    async load() {
        for (const [name, data] of Object.entries(this.configs)) {
            const book = new Questbook(name.toLowerCase(), data);

            try {
                await this._loadBook(book);
                this.books.set(book.name, book);
            } catch (err) {
                getLogger().error(`Couldn't load the ${book.title} questbook:`, err);
            }
        }
    }

    get(name) {
        const book = this.books.get(String(name ?? "").toLowerCase());

        if (typeof book === "undefined") {
            throw new QuestbookError(`Unknown questbook "${name}"`, { name, names: this.names });
        }

        return book;
    }

    getDefault() {
        return Util.first(Array.from(this.books.values())) ?? null;
    }

    async _loadBook(book) {
        for (const [mode, url] of Object.entries(book.urls)) {
            const res = await axios.request({ url, responseType: "json", timeout: QuestbookManager.requestTimeout }),
                count = book.load(mode, res.data);

            getLogger().info(`Loaded ${count} ${mode} quests for the ${book.title} questbook.`);
        }
    }
}

export default QuestbookManager;
