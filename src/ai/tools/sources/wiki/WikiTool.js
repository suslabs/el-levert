import AITool from "../../AITool.js";

import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

class WikiTool extends AITool {
    get wiki() {
        return this.manager.sources.get(AISourceTypes.wiki);
    }

    isAvailable() {
        return this.wiki !== null;
    }
}

export default WikiTool;
