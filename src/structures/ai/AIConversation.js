import { getConfig } from "../../LevertClient.js";

class AIConversation {
    constructor(msg, history, followUps) {
        this.id = msg.id;
        this.msg = msg;

        this.history = history;
        this.followUps = followUps;

        this.timeout = getConfig().interactionTimeout;
        this.busy = false;

        this.touch();
    }

    touch() {
        this.timestamp = Date.now();
    }

    getFollowUp(num) {
        return this.followUps[num - 1] ?? null;
    }
}

export default AIConversation;
