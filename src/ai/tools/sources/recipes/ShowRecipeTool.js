import RecipeTool from "./RecipeTool.js";
import ToolParams from "../../ToolParams.js";

import AIPhases from "../../../../structures/ai/AIPhases.js";

import Util from "../../../../util/Util.js";

import AIError from "../../../../errors/AIError.js";

class ShowRecipeTool extends RecipeTool {
    static info = {
        name: "show_recipe",
        emoji: "🖼️",
        phase: AIPhases.rendering,
        description:
            "Render one recipe from search_recipes as an image card and show it with your answer. Call it once, for the recipe the user most likely means.",
        parameters: ToolParams.object(
            {
                itemId: ToolParams.string("Item ID from search_recipes."),
                idx: ToolParams.integer("Recipe idx from search_recipes."),
                expert: ToolParams.boolean("Use expert (hard) mode recipes.")
            },
            ["itemId", "idx"]
        )
    };

    getStatus() {
        return "Rendering the recipe card";
    }

    async execute(args, session) {
        const itemId = String(args.itemId ?? "").trim();

        if (Util.empty(itemId) || !Number.isInteger(args.idx) || args.idx < 0) {
            throw new AIError("itemId and a recipe idx from search_recipes are required");
        }

        const recipes = this.recipes;

        const card = await recipes.renderCard(itemId, args.idx, {
            mode: recipes.getMode(args.expert),
            timeout: session.toolTimeout()
        });

        session.showImage(card);

        return { shown: true };
    }
}

export default ShowRecipeTool;
