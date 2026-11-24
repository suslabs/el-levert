import MarkdownStyler from "../markdown/MarkdownStyler.js";
import MarkdownStyles from "../markdown/MarkdownStyles.js";

import Util from "../../util/Util.js";
import TypeTester from "../../util/TypeTester.js";

import ParserError from "../../errors/ParserError.js";

const QuestbookParser = Object.freeze({
    prereqTypes: Object.freeze(["normal", "implicit", "hidden"]),

    _formattingRegex: /§./g,
    stripFormatting: str => {
        return String(str ?? "").replace(QuestbookParser._formattingRegex, "");
    },

    _resetCode: "r",
    _whiteCode: "f",

    _codeStyles: Object.freeze({
        l: MarkdownStyles.bold,
        m: MarkdownStyles.strike,
        n: MarkdownStyles.underline,
        o: MarkdownStyles.italic
    }),

    _bulletRegex: /^((?:\s|§.)*)\* /gm,
    _emptyFormatRegex: /(§[^r])+\s*§r/g,
    _colorRegex: /§[0-9a-eg]/g,
    _openSpaceRegex: /(§[^r])(\s+)/g,
    _closeSpaceRegex: /(\s+)(§r)/g,
    _tokenRegex: /(\s*)(§.)(\s*)/g,
    _codeRegex: /^§(.)$/,

    _formatToken: (token, styler) => {
        const match = token.match(QuestbookParser._codeRegex);

        if (match === null) {
            return token;
        }

        const code = match[1],
            style = QuestbookParser._codeStyles[code];

        if (code === QuestbookParser._resetCode) {
            return styler.reset();
        } else if (code === QuestbookParser._whiteCode) {
            return styler.end(MarkdownStyles.bold);
        } else if (typeof style === "undefined") {
            return "";
        } else {
            return styler.start(style);
        }
    },

    formatMarkdown: str => {
        const text = String(str ?? "")
            .replace(QuestbookParser._bulletRegex, "$1- ")
            .replace(QuestbookParser._emptyFormatRegex, "")
            .replace(QuestbookParser._colorRegex, "§l")
            .replace(QuestbookParser._openSpaceRegex, "$2$1")
            .replace(QuestbookParser._closeSpaceRegex, "$2$1");

        const styler = new MarkdownStyler();

        return `${text.trim()}§r`
            .split(QuestbookParser._tokenRegex)
            .map(token => QuestbookParser._formatToken(token, styler))
            .join("");
    },

    parse: raw => {
        const data = QuestbookParser._normalize(raw);

        if (!TypeTester.isObject(data) || !Array.isArray(data.questDatabase)) {
            throw new ParserError("Invalid questbook: no quest database found");
        }

        return {
            packName: data.questSettings?.betterquesting?.pack_name ?? null,
            packVersion: data.questSettings?.betterquesting?.pack_version ?? null,
            quests: data.questDatabase.map(QuestbookParser._parseQuest),
            lines: (data.questLines ?? []).map(QuestbookParser._parseLine)
        };
    },

    _typeSeparator: ":",
    _listType: "9",

    _splitKey: key => {
        const idx = key.lastIndexOf(QuestbookParser._typeSeparator);
        return idx === -1 ? [key, null] : [key.slice(0, idx), key.slice(idx + 1)];
    },

    _getListIdx: key => {
        return Util.parseInt(Util.first(QuestbookParser._splitKey(key)));
    },

    _toList: obj => {
        return Object.entries(obj)
            .sort(([a], [b]) => QuestbookParser._getListIdx(a) - QuestbookParser._getListIdx(b))
            .map(([, value]) => QuestbookParser._normalize(value));
    },

    _normalizeField: (type, value) => {
        if (type === QuestbookParser._listType && TypeTester.isObject(value)) {
            return QuestbookParser._toList(value);
        }

        return QuestbookParser._normalize(value);
    },

    _normalize: value => {
        if (Array.isArray(value)) {
            return value.map(QuestbookParser._normalize);
        } else if (!TypeTester.isObject(value)) {
            return value;
        }

        const out = {};

        for (const [key, item] of Object.entries(value)) {
            const [name, type] = QuestbookParser._splitKey(key);
            out[name] = QuestbookParser._normalizeField(type, item);
        }

        return out;
    },

    _getProps: obj => {
        return obj.properties?.betterquesting ?? {};
    },

    _parseItem: item => {
        return {
            id: item.id,
            damage: item.Damage ?? 0,
            count: item.Count ?? 1,
            oreDict: Util.nonemptyString(item.OreDict) ? item.OreDict : null
        };
    },

    _parseFluid: fluid => {
        return {
            name: fluid.FluidName,
            amount: fluid.Amount ?? 0
        };
    },

    _parseTask: task => {
        return {
            type: task.taskID,
            items: (task.requiredItems ?? []).map(QuestbookParser._parseItem),
            fluids: (task.requiredFluids ?? []).map(QuestbookParser._parseFluid)
        };
    },

    _parseReward: reward => {
        return {
            type: reward.rewardID,
            items: (reward.rewards ?? []).map(QuestbookParser._parseItem),
            choices: (reward.choices ?? []).map(QuestbookParser._parseItem)
        };
    },

    _parsePrereqs: quest => {
        const types = quest.preRequisiteTypes ?? [];

        return (quest.preRequisites ?? []).map((id, i) => ({
            id: String(id),
            type: QuestbookParser.prereqTypes[types[i] ?? 0]
        }));
    },

    _parseQuest: quest => {
        const props = QuestbookParser._getProps(quest);

        return {
            id: String(quest.questID),
            name: QuestbookParser.stripFormatting(props.name),
            desc: String(props.desc ?? ""),
            logic: props.questlogic ?? null,
            icon: TypeTester.isObject(props.icon) ? QuestbookParser._parseItem(props.icon) : null,
            main: props.ismain === 1,
            visibility: props.visibility ?? null,
            prereqs: QuestbookParser._parsePrereqs(quest),
            tasks: (quest.tasks ?? []).map(QuestbookParser._parseTask),
            rewards: (quest.rewards ?? []).map(QuestbookParser._parseReward)
        };
    },

    _parseLine: line => {
        const props = QuestbookParser._getProps(line);

        return {
            id: String(line.lineID),
            name: QuestbookParser.stripFormatting(props.name),
            desc: QuestbookParser.stripFormatting(props.desc),
            order: line.order ?? 0,
            quests: (line.quests ?? []).map(entry => String(entry.id))
        };
    }
});

export default QuestbookParser;
