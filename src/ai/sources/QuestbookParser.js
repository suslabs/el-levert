import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

const QuestbookParser = Object.freeze({
    _formattingRegex: /§./g,
    stripFormatting: str => {
        return String(str ?? "").replace(QuestbookParser._formattingRegex, "");
    },

    parse: raw => {
        const chapters = QuestbookParser._getChapters(raw);

        return QuestbookParser._list(QuestbookParser._field(raw, "questDatabase")).map(quest => {
            const id = String(QuestbookParser._field(quest, "questID")),
                props = QuestbookParser._props(quest);

            const tasks = QuestbookParser._list(QuestbookParser._field(quest, "tasks")).map(
                QuestbookParser._formatTask
            );

            return {
                id,
                title: QuestbookParser.stripFormatting(QuestbookParser._field(props, "name")) || `Quest ${id}`,
                chapter: chapters.get(id) ?? null,
                keywords: tasks.join(" "),
                text: QuestbookParser.stripFormatting(QuestbookParser._field(props, "desc")),
                tasks,
                prereqs: QuestbookParser._list(QuestbookParser._field(quest, "preRequisites")).map(String)
            };
        });
    },

    _field: (obj, name) => {
        if (!TypeTester.isObject(obj)) {
            return undefined;
        }

        const key = Object.keys(obj).find(objKey => Util.first(objKey.split(":")) === name);
        return typeof key === "undefined" ? undefined : obj[key];
    },

    _list: obj => {
        if (Array.isArray(obj)) {
            return obj;
        }

        return TypeTester.isObject(obj) ? Object.values(obj) : [];
    },

    _props: obj => {
        return QuestbookParser._field(QuestbookParser._field(obj, "properties"), "betterquesting");
    },

    _getChapters: raw => {
        const chapters = new Map();

        for (const line of QuestbookParser._list(QuestbookParser._field(raw, "questLines"))) {
            const name = QuestbookParser.stripFormatting(QuestbookParser._field(QuestbookParser._props(line), "name"));

            for (const entry of QuestbookParser._list(QuestbookParser._field(line, "quests"))) {
                chapters.set(String(QuestbookParser._field(entry, "id")), name);
            }
        }

        return chapters;
    },

    _formatItem: item => {
        const count = QuestbookParser._field(item, "Count") ?? 1,
            damage = QuestbookParser._field(item, "Damage");

        const name = QuestbookParser._field(item, "id"),
            meta = damage ? `:${damage}` : "";

        return `${count}x ${name}${meta}`;
    },

    _taskPrefixRegex: /^bq_standard:/,
    _formatTask: task => {
        const type = String(QuestbookParser._field(task, "taskID")).replace(QuestbookParser._taskPrefixRegex, ""),
            items = QuestbookParser._list(QuestbookParser._field(task, "requiredItems")).map(
                QuestbookParser._formatItem
            );

        return Util.empty(items) ? type : `${type}: ${items.join(", ")}`;
    }
});

export default QuestbookParser;
