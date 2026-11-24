import QuestTool from "./QuestTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchQuestsTool extends QuestTool {
    static info = {
        name: "search_quests",
        emoji: "🗺️",
        phase: AIPhases.searching,
        description:
            "Search the modpack's questbook, its in-game progression guide (what to build next, how to reach a tier, what a quest asks for). Returns short matches; read_quest gives the full quests.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Search keywords."),
                book: ToolParams.string("Questbook name from the runtime context (default: the first one)."),
                limit: ToolParams.integer("Results, 1-10 (default 5)."),
                expert: ToolParams.boolean("Use the expert (hard) mode questbook.")
            },
            ["query"]
        )
    };

    static maxCalls = 4;

    static defaultLimit = 5;
    static maxLimit = 10;

    static snippetLength = 240;

    getStatus(args) {
        return `Searching the questbook for "${this.formatArg(args.query)}"`;
    }

    execute(args, session) {
        const query = this.requireString(args, "query");

        const questbook = this.getQuestbook(args.book),
            limit = this.getLimit(args);

        const quests = questbook.search(query, questbook.getMode(session.resolveExpert(args.expert)), limit);

        return {
            query,
            questbook: questbook.title,
            quests: quests.map(quest => ({
                source: this.formatSource(quest),
                id: quest.id,
                title: quest.title,
                chapter: quest.chapter,
                snippet: Util.trimString(quest.text, SearchQuestsTool.snippetLength)
            }))
        };
    }
}

export default SearchQuestsTool;
