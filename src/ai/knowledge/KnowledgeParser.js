import KnowledgeFormats from "./KnowledgeFormats.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";
import ArrayUtil from "../../util/ArrayUtil.js";

import AIError from "../../errors/AIError.js";

const KnowledgeParser = Object.freeze({
    _formattingRegex: /§./g,
    stripFormatting: str => {
        return String(str ?? "").replace(KnowledgeParser._formattingRegex, "");
    },

    parse: (format, raw, kind) => {
        switch (format) {
            case KnowledgeFormats.json:
                return KnowledgeParser.parseJson(raw, kind);
            case KnowledgeFormats.betterQuesting:
                return KnowledgeParser.parseBetterQuesting(raw, kind);
            default:
                throw new AIError("Unknown knowledge format", format);
        }
    },

    parseJson: (raw, kind) => {
        const list = Array.isArray(raw) ? raw : (raw.entries ?? []);

        return list.map((entry, i) => ({
            kind,
            id: String(entry.id ?? i),
            title: String(entry.title ?? entry.id),
            chapter: entry.chapter ?? null,
            keywords: ArrayUtil.guaranteeArray(entry.keywords ?? []).join(" "),
            text: String(entry.text ?? ""),
            tasks: ArrayUtil.guaranteeArray(entry.tasks ?? []),
            prereqs: ArrayUtil.guaranteeArray(entry.prereqs ?? []).map(String),
            ref: entry.url ?? null
        }));
    },

    parseBetterQuesting: (raw, kind) => {
        const chapters = KnowledgeParser._bqChapters(raw);

        return KnowledgeParser._bqList(KnowledgeParser._bqField(raw, "questDatabase")).map(quest => {
            const id = String(KnowledgeParser._bqField(quest, "questID")),
                props = KnowledgeParser._bqProps(quest);

            const tasks = KnowledgeParser._bqList(KnowledgeParser._bqField(quest, "tasks")).map(
                KnowledgeParser._bqTask
            );

            return {
                kind,
                id,
                title: KnowledgeParser.stripFormatting(KnowledgeParser._bqField(props, "name")) || `Quest ${id}`,
                chapter: chapters.get(id) ?? null,
                keywords: tasks.join(" "),
                text: KnowledgeParser.stripFormatting(KnowledgeParser._bqField(props, "desc")),
                tasks,
                prereqs: KnowledgeParser._bqList(KnowledgeParser._bqField(quest, "preRequisites")).map(String),
                ref: null
            };
        });
    },

    _bqField: (obj, name) => {
        if (!TypeTester.isObject(obj)) {
            return undefined;
        }

        const key = Object.keys(obj).find(objKey => Util.first(objKey.split(":")) === name);
        return typeof key === "undefined" ? undefined : obj[key];
    },

    _bqList: obj => {
        if (Array.isArray(obj)) {
            return obj;
        }

        return TypeTester.isObject(obj) ? Object.values(obj) : [];
    },

    _bqProps: obj => {
        return KnowledgeParser._bqField(KnowledgeParser._bqField(obj, "properties"), "betterquesting");
    },

    _bqChapters: raw => {
        const chapters = new Map();

        for (const line of KnowledgeParser._bqList(KnowledgeParser._bqField(raw, "questLines"))) {
            const name = KnowledgeParser.stripFormatting(
                KnowledgeParser._bqField(KnowledgeParser._bqProps(line), "name")
            );

            for (const entry of KnowledgeParser._bqList(KnowledgeParser._bqField(line, "quests"))) {
                chapters.set(String(KnowledgeParser._bqField(entry, "id")), name);
            }
        }

        return chapters;
    },

    _bqItem: item => {
        const count = KnowledgeParser._bqField(item, "Count") ?? 1,
            damage = KnowledgeParser._bqField(item, "Damage");

        const name = KnowledgeParser._bqField(item, "id"),
            meta = damage ? `:${damage}` : "";

        return `${count}x ${name}${meta}`;
    },

    _bqTaskPrefixRegex: /^bq_standard:/,
    _bqTask: task => {
        const type = String(KnowledgeParser._bqField(task, "taskID")).replace(KnowledgeParser._bqTaskPrefixRegex, ""),
            items = KnowledgeParser._bqList(KnowledgeParser._bqField(task, "requiredItems")).map(
                KnowledgeParser._bqItem
            );

        return Util.empty(items) ? type : `${type}: ${items.join(", ")}`;
    }
});

export default KnowledgeParser;
