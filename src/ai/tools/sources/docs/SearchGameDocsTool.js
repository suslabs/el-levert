import DocsTool from "./DocsTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import ToolParams from "../../../../util/ai/ToolParams.js";

class SearchGameDocsTool extends DocsTool {
    static info = {
        name: "search_gregtech_docs",
        emoji: "📗",
        phase: AIPhases.reading,
        description:
            "Search the GregTech CEu reference for how the mod works: voltage tiers, amperage, cables, overclocking, EBF coils and heat, multiblocks, maintenance, ore processing, chemistry, power generation and common abbreviations.",
        parameters: ToolParams.object(
            {
                query: ToolParams.string('The mechanic you need, e.g. "ebf coil heat bonus" or "cable loss".'),
                limit: ToolParams.integer("Sections, 1-6 (default 4).")
            },
            ["query"]
        )
    };

    static sourceType = AISourceTypes.gameDocs;
}

export default SearchGameDocsTool;
