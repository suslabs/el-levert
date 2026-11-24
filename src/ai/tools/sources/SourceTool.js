import AITool from "../AITool.js";

class SourceTool extends AITool {
    static sourceType = null;

    get source() {
        return this.manager.sources.get(this.constructor.sourceType);
    }

    isAvailable() {
        return this.source !== null;
    }
}

export default SourceTool;
