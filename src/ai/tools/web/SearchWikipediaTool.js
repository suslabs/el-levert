import AITool from "../AITool.js";
import ToolParams from "../ToolParams.js";
import WebSearcher from "../../WebSearcher.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import Util from "../../../util/Util.js";

import AIError from "../../../errors/AIError.js";

class SearchWikipediaTool extends AITool {
    static info = {
        name: "search_wikipedia",
        emoji: "📚",
        phase: AIPhases.searching,
        description:
            "Search Wikipedia for encyclopedic facts (people, places, history, science, definitions). Read a result in full with fetch_web_page.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Search keywords."),
                language: ToolParams.string('Wikipedia language code, e.g. "en", "de" (default "en").'),
                limit: ToolParams.integer("Results, 1-8 (default 5).")
            },
            ["query"]
        )
    };

    static defaultLimit = 5;
    static maxLimit = 8;

    static _languageRegex = /^[a-z]{2,3}(-[a-z]+)?$/;

    getStatus(args) {
        return `Searching Wikipedia for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = String(args.query ?? "").trim(),
            language = String(args.language ?? WebSearcher.defaultWikipediaLanguage).toLowerCase();

        if (Util.empty(query)) {
            throw new AIError("query is required");
        } else if (!SearchWikipediaTool._languageRegex.test(language)) {
            throw new AIError(`Invalid Wikipedia language "${language}"`);
        }

        const limit = Util.clamp(args.limit ?? SearchWikipediaTool.defaultLimit, 1, SearchWikipediaTool.maxLimit);

        const results = await this.manager.webSearcher.searchWikipedia(query, limit, session.toolTimeout(), language);
        return { query, language, results };
    }
}

export default SearchWikipediaTool;
