import SourceTool from "../SourceTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchWikiTool extends SourceTool {
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

    static quick = true;

    static sourceType = AISourceTypes.wiki;

    static maxCalls = 3;

    static defaultLimit = 5;
    static maxLimit = 8;

    getStatus(args) {
        return `Searching ${this.source.name} for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query");

        const language = this.source.getLanguage(args.language),
            limit = this.getLimit(args);

        const results = await this.source.search(query, { language, limit, timeout: session.toolTimeout() });
        return { query, language, results };
    }
}

export default SearchWikiTool;
