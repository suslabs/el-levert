import AITool from "../../AITool.js";

import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

class DocsTool extends AITool {
    get docs() {
        return this.manager.sources.get(AISourceTypes.docs);
    }

    isAvailable() {
        return this.docs !== null;
    }
}

export default DocsTool;
