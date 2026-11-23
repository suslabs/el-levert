import AITool from "../AITool.js";

import AIPhases from "../../../structures/ai/AIPhases.js";

import ToolParams from "../../../util/ai/ToolParams.js";

class SearchWebTool extends AITool {
    static info = {
        name: "search_web",
        emoji: "🌐",
        phase: AIPhases.searching,
        description:
            "Web search for current, niche, disputed or external facts, and modpack questions the tags don't cover.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string("Short search query."),
                limit: ToolParams.integer("Results, 1-8 (default 5).")
            },
            ["query"]
        )
    };

    static defaultLimit = 5;
    static maxLimit = 8;

    getStatus(args) {
        return `Searching the web for "${this.formatArg(args.query)}"`;
    }

    async execute(args, session) {
        const query = this.requireString(args, "query"),
            limit = this.getLimit(args);

        return await this.manager.webSearcher.search(query, limit, session.toolTimeout());
    }
}

export default SearchWebTool;
