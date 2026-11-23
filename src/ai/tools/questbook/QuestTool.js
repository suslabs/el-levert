import AITool from "../AITool.js";

import AISourceTypes from "../../../structures/ai/AISourceTypes.js";
import PackModes from "../../../structures/ai/PackModes.js";

class QuestTool extends AITool {
    get questbook() {
        return this.manager.sources.get(AISourceTypes.questbook);
    }

    isAvailable() {
        return this.questbook !== null;
    }

    getMode(expert) {
        return expert ? PackModes.expert : PackModes.normal;
    }

    formatSource(quest) {
        return `Quest "${quest.title}"`;
    }
}

export default QuestTool;
