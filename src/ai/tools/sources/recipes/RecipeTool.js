import AITool from "../../AITool.js";

import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

class RecipeTool extends AITool {
    get recipes() {
        return this.manager.sources.get(AISourceTypes.recipes);
    }

    isAvailable() {
        return this.recipes !== null;
    }
}

export default RecipeTool;
