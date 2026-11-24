import SourceTool from "../SourceTool.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";
import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

import Util from "../../../../util/Util.js";
import ToolParams from "../../../../util/ai/ToolParams.js";

import AIError from "../../../../errors/AIError.js";

class ShowRecipeTool extends SourceTool {
    static info = {
        name: "show_recipe",
        emoji: "🖼️",
        phase: AIPhases.rendering,
        description:
            "Render one recipe from search_recipes as an image card and show it with your answer. Call it once, for the recipe the user most likely means.",
        parameters: ToolParams.object(
            {
                itemId: ToolParams.string(
                    "The recipe's itemId from search_recipes (hot ingot EBF steps use the hot ingot's)."
                ),
                idx: ToolParams.integer("The recipe's idx from search_recipes."),
                expert: ToolParams.boolean("Use expert (hard) mode recipes.")
            },
            ["itemId", "idx"]
        )
    };

    static sourceType = AISourceTypes.recipes;

    getStatus() {
        return "Rendering the recipe card";
    }

    async execute(args, session) {
        const itemId = String(args.itemId ?? "").trim();

        if (Util.empty(itemId) || !Number.isInteger(args.idx) || args.idx < 0) {
            throw new AIError("itemId and a recipe idx from search_recipes are required");
        }

        const card = await this.source.renderCard(itemId, args.idx, {
            mode: this.source.getMode(session.resolveExpert(args.expert)),
            timeout: session.toolTimeout()
        });

        session.showImage(card);

        return { shown: true };
    }
}

export default ShowRecipeTool;
