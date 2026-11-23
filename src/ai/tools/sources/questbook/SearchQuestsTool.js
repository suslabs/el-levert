import QuestTool from "./QuestTool.js";
import ToolParams from "../../ToolParams.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";

class SearchQuestsTool extends QuestTool {
    static info = {
        name: "search_quests",
        emoji: "📜",
        phase: AIPhases.searching,
        description:
            "Search the modpack's questbook, its in-game progression guide (what to build next, how to reach a tier, what a quest asks for). Returns short matches; read_quest gives the full quests.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Search keywords."),
                limit: ToolParams.integer("Results, 1-10 (default 5)."),
                expert: ToolParams.boolean("Use the expert (hard) mode questbook.")
            },
            ["query"]
        )
    };

    static defaultLimit = 5;
    static maxLimit = 10;

    static snippetLength = 240;

    getStatus(args) {
        return `Searching the questbook for "${this.formatArg(args.query)}"`;
    }

    execute(args) {
        const query = this.requireString(args, "query");

        const limit = this.getLimit(args),
            quests = this.questbook.search(query, this.questbook.getMode(args.expert), limit);

        return {
            query,
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
