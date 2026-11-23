import PackSource from "./PackSource.js";
import QuestbookParser from "../../parsers/questbook/QuestbookParser.js";

import { getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import BM25Index from "../../util/search/BM25Index.js";

import AIError from "../../errors/AIError.js";

class Questbook extends PackSource {
    static fieldWeights = {
        title: 3,
        keywords: 2,
        text: 1
    };

    constructor(http, options, timeout) {
        options = ObjectUtil.guaranteeObject(options);
        super(http, options);

        this.timeout = timeout;

        this.urls = options.urls ?? {};
        this.books = new Map();
    }

    async load() {
        for (const [mode, url] of Object.entries(this.urls)) {
            const res = await this.http.request({ url, responseType: "json", timeout: this.timeout }),
                quests = Questbook._createQuests(QuestbookParser.parse(res.data));

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

    static _taskPrefixRegex = /^bq_standard:/;

    static _formatItem(item) {
        return `${item.count}x ${item.id}${item.damage === 0 ? "" : `:${item.damage}`}`;
    }

    static _formatFluid(fluid) {
        return `${fluid.amount} mB ${fluid.name}`;
    }

    static _formatTask(task) {
        const type = task.type.replace(Questbook._taskPrefixRegex, ""),
            reqs = [...task.items.map(Questbook._formatItem), ...task.fluids.map(Questbook._formatFluid)];

        return Util.empty(reqs) ? type : `${type}: ${reqs.join(", ")}`;
    }

    static _getChapters(lines) {
        const chapters = new Map();

        for (const line of lines) {
            for (const id of line.quests) {
                chapters.set(id, [...(chapters.get(id) ?? []), line.name]);
            }
        }

        return chapters;
    }

    static _createQuest(quest, chapters) {
        const tasks = quest.tasks.map(Questbook._formatTask);

        return {
            id: quest.id,
            title: Util.nonemptyString(quest.name) ? quest.name : `Quest ${quest.id}`,
            chapter: chapters.join(", "),
            keywords: tasks.join(" "),
            text: quest.desc,
            tasks,
            prereqs: quest.prereqs.map(prereq => prereq.id)
        };
    }

    static _createQuests(book) {
        const chapters = Questbook._getChapters(book.lines);

        return book.quests
            .filter(quest => chapters.has(quest.id))
            .map(quest => Questbook._createQuest(quest, chapters.get(quest.id)));
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
