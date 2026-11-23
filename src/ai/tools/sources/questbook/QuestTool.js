import AITool from "../../AITool.js";

import AISourceTypes from "../../../../structures/ai/AISourceTypes.js";

class QuestTool extends AITool {
    get questbook() {
        return this.manager.sources.get(AISourceTypes.questbook);
    }

    isAvailable() {
        return this.questbook !== null;
    }

    formatSource(quest) {
        return `Quest "${quest.title}"`;
    }
}

export default QuestTool;
