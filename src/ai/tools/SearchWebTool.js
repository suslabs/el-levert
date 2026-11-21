import AITool from "./AITool.js";
import ToolParams from "./ToolParams.js";

import Util from "../../util/Util.js";

class SearchWebTool extends AITool {
    static info = {
        name: "search_web",
        description:
            "Web search for current, niche, disputed or external facts. Third priority after domain lookup and tags.",
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

    async execute(args, session) {
        const query = String(args.query ?? "").trim();

        if (Util.empty(query)) {
            return { error: "query is required." };
        }

        const limit = Util.clamp(args.limit ?? SearchWebTool.defaultLimit, 1, SearchWebTool.maxLimit);
        return await this.manager.webSearcher.search(query, limit, session.toolTimeout());
    }
}

export default SearchWebTool;
