import AITool from "../AITool.js";

class RecipeTool extends AITool {
    isAvailable() {
        return this.manager.recipes !== null;
    }
}

export default RecipeTool;
