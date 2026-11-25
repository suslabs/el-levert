import AITool from "../AITool.js";

import AISourceTypes from "../../../structures/ai/AISourceTypes.js";

import { getClient } from "../../../LevertClient.js";

import AIError from "../../../errors/AIError.js";

class SourceTool extends AITool {
    static sourceType = null;

    constructor() {
        super();

        if (!AISourceTypes.has(this.constructor.sourceType)) {
            throw new AIError("Source tool must have a valid source type");
        }
    }

    get source() {
        return getClient().aiManager.sources.get(this.constructor.sourceType);
    }

    isAvailable() {
        return this.source !== null;
    }
}

export default SourceTool;
