import Util from "../util/Util.js";
import ArrayUtil from "../util/ArrayUtil.js";
import AIUtil from "../util/ai/AIUtil.js";

class AIAnswerParser {
    static marker = "[[EXTRAS]]";

    static followUpsHeader = "follow-ups:";
    static sourcesHeader = "sources:";

    static maxFollowUps = 5;
    static maxFollowUpLength = 80;
    static maxSources = 3;

    static getPreview(text) {
        const idx = text.lastIndexOf(AIAnswerParser.marker);

        if (idx !== -1) {
            return text.slice(0, idx);
        }

        for (let i = AIAnswerParser.marker.length - 1; i > 0; i--) {
            if (text.endsWith(AIAnswerParser.marker.slice(0, i))) {
                return text.slice(0, -i);
            }
        }

        return text;
    }

    static parse(text, ledger) {
        const idx = text.lastIndexOf(AIAnswerParser.marker),
            answer = AIAnswerParser.getPreview(text).trim();

        if (idx === -1) {
            return { answer, followUps: [], sources: [] };
        }

        const lists = AIAnswerParser._parseLists(text.slice(idx + AIAnswerParser.marker.length));

        return {
            answer,
            followUps: ArrayUtil.unique(AIUtil.cleanList(lists.followUps).map(AIAnswerParser._formatFollowUp)).slice(
                0,
                AIAnswerParser.maxFollowUps
            ),
            sources: AIUtil.cleanList(lists.sources)
                .filter(source => ledger.has(source))
                .slice(0, AIAnswerParser.maxSources)
        };
    }

    static _formatFollowUp(followUp) {
        return AIUtil.formatQuestion(Util.trimString(followUp, AIAnswerParser.maxFollowUpLength));
    }

    static _itemRegex = /^\s*(?:[-*•]|\d+[.)])\s+/;

    static _parseLists(trailer) {
        const lists = { followUps: [], sources: [] };

        let current = null;

        for (const line of trailer.split("\n")) {
            const lower = line.trim().toLowerCase();

            if (lower === AIAnswerParser.followUpsHeader) {
                current = lists.followUps;
            } else if (lower === AIAnswerParser.sourcesHeader) {
                current = lists.sources;
            } else if (current !== null && AIAnswerParser._itemRegex.test(line)) {
                current.push(line.replace(AIAnswerParser._itemRegex, ""));
            }
        }

        return lists;
    }
}

export default AIAnswerParser;
