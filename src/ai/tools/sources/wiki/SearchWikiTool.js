import WikiTool from "./WikiTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchWikiTool extends WikiTool {
    static info = {
        name: "search_wikipedia",
        emoji: "📚",
        phase: AIPhases.searching,
        description:
            "Search Wikipedia for encyclopedic facts (people, places, history, science, definitions). Read a result in full with read_wikipedia.",
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

    getStatus(args) {
        return `Searching ${this.wiki.name} for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query");

        const language = this.wiki.getLanguage(args.language),
            limit = this.getLimit(args);

        const results = await this.wiki.search(query, { language, limit, timeout: session.toolTimeout() });
        return { query, language, results };
    }
}

export default SearchWikiTool;
