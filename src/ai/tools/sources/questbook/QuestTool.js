import AITool from "../../AITool.js";

import { getClient } from "../../../../LevertClient.js";

import Util from "../../../../util/Util.js";

class QuestTool extends AITool {
    isAvailable() {
        return (getClient().questbookManager?.getDefault() ?? null) !== null;
    }

    getQuestbook(name) {
        const manager = getClient().questbookManager;
        return Util.nonemptyString(name) ? manager.get(name) : manager.getDefault();
    }

    formatSource(quest) {
        return `Quest "${quest.title}"`;
    }
}

export default QuestTool;
