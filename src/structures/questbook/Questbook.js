import QuestbookParser from "../../parsers/questbook/QuestbookParser.js";

import PackModes from "../PackModes.js";

import Util from "../../util/Util.js";
import ArrayUtil from "../../util/ArrayUtil.js";
import ObjectUtil from "../../util/ObjectUtil.js";
import BM25Index from "../../util/search/BM25Index.js";
import createuFuzzySearch from "../../util/search/uFuzzySearch.js";

import QuestbookError from "../../errors/QuestbookError.js";

class Questbook {
    static fieldWeights = {
        title: 3,
        chapter: 1,
        keywords: 2,
        text: 1
    };

    static indexOptions = {
        prefixWeight: 0.6
    };

    static titleSearcher = createuFuzzySearch({ intraMode: 1 });
    static fuzzyRank = 3;
    static minCoverage = 0.5;

    constructor(name, data) {
        data = ObjectUtil.guaranteeObject(data);

        this.name = name;
        this.title = data.title ?? name;
        this.urls = data.urls ?? {};

        this.books = new Map();
    }

    getMode(expert) {
        return expert ? PackModes.expert : PackModes.normal;
    }

    load(mode, raw) {
        const parsed = QuestbookParser.parse(raw),
            quests = Questbook._createQuests(parsed);

        this.books.set(mode, Questbook._createBook(quests, parsed.packVersion));
        return quests.length;
    }

    getVersion(mode) {
        return this._getBook(mode).version;
    }

    searchTitles(query, mode, limit) {
        const book = this._getBook(mode),
            terms = Questbook._getWords(query);

        const ranked = this._rankTitles(book, query, terms).map(match => match.quest),
            partial = Questbook._findPartialTitles(book.list, terms);

        return ArrayUtil.unique([...ranked, ...partial]).slice(0, limit);
    }

    search(query, mode, limit) {
        const book = this._getBook(mode),
            terms = Questbook._getWords(query);

        const [strong, weak] = ArrayUtil.split(
            this._rankTitles(book, query, terms),
            match => match.rank === Questbook.fuzzyRank
        );

        const partial = Questbook._findPartialTitles(book.list, terms),
            text = book.index.search(query, limit).map(res => res.doc);

        const quests = [...strong.map(match => match.quest), ...partial, ...text, ...weak.map(match => match.quest)];
        return ArrayUtil.unique(quests).slice(0, limit);
    }

    get(id, mode) {
        return this._getBook(mode).quests.get(String(id)) ?? null;
    }

    findByTitle(title, mode) {
        const lower = title.toLowerCase();

        for (const quest of this._getBook(mode).quests.values()) {
            if (quest.title.toLowerCase() === lower) {
                return quest;
            }
        }

        return null;
    }

    static _wordRegex = /[^\p{L}\p{N}]+/u;

    static _getWords(str) {
        return str.toLowerCase().split(Questbook._wordRegex).filter(Util.nonemptyString);
    }

    static _getTitleRank(title, query, terms) {
        const lowerTitle = title.toLowerCase(),
            lowerQuery = query.toLowerCase().trim();

        const words = Questbook._getWords(title);

        if (lowerTitle === lowerQuery) {
            return 0;
        } else if (lowerTitle.startsWith(lowerQuery)) {
            return 1;
        } else if (terms.every(term => words.includes(term))) {
            return 2;
        } else {
            return Questbook.fuzzyRank;
        }
    }

    static _getCoverage(title, terms) {
        const words = Questbook._getWords(title);
        return terms.filter(term => words.includes(term)).length / terms.length;
    }

    static _findPartialTitles(quests, terms) {
        if (Util.single(terms) || Util.empty(terms)) {
            return [];
        }

        return quests
            .map(quest => ({ quest, coverage: Questbook._getCoverage(quest.title, terms) }))
            .filter(match => match.coverage >= Questbook.minCoverage)
            .sort((a, b) => b.coverage - a.coverage)
            .map(match => match.quest);
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
            text: QuestbookParser.stripFormatting(quest.desc),
            markdown: QuestbookParser.formatMarkdown(quest.desc),
            logic: quest.logic,
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

    static _createBook(quests, version) {
        const index = new BM25Index(Questbook.fieldWeights, Questbook.indexOptions);
        quests.forEach(quest => index.add(quest));

        return { index, version, list: quests, quests: new Map(quests.map(quest => [quest.id, quest])) };
    }

    _rankTitles(book, query, terms) {
        return Questbook.titleSearcher
            .search(book.list, query, { searchKey: "title" })
            .results.map(quest => ({ quest, rank: Questbook._getTitleRank(quest.title, query, terms) }))
            .sort((a, b) => a.rank - b.rank);
    }

    _getBook(mode) {
        const book = this.books.get(mode);

        if (typeof book === "undefined") {
            throw new QuestbookError(`The ${this.title} questbook has no ${mode} mode`, { name: this.name, mode });
        }

        return book;
    }
}

export default Questbook;
