import Util from "../util/Util.js";

class MessageDispatcher {
    static maxEditAge = (2 * Util.durationSeconds.minute) / Util.durationSeconds.milli;
    static maxEditDelay = (10 * Util.durationSeconds.second) / Util.durationSeconds.milli;

    constructor(client) {
        this.client = client;

        this.executeAllHandlers = client._executeAllHandlers;
    }

    shouldProcess(msg) {
        if (this.client.isBridgeBot(msg.author.id)) {
            return true;
        }

        return !msg.author.bot;
    }

    shouldProcessEdit(oldMsg, newMsg) {
        if (!newMsg.editedTimestamp) {
            return false;
        }

        const now = Date.now();

        if (now - newMsg.createdTimestamp > MessageDispatcher.maxEditAge) {
            return false;
        } else if (now - newMsg.editedTimestamp > MessageDispatcher.maxEditDelay) {
            return false;
        } else if (!oldMsg.partial && oldMsg.content === newMsg.content) {
            return false;
        }

        return true;
    }

    async processMessage(msg, handler) {
        if (!this.shouldProcess(msg)) {
            return;
        }

        await this.executeAllHandlers(handler, msg);
    }

    async processCreate(msg) {
        await this.processMessage(msg, "execute");
    }

    async processDelete(msg) {
        await this.processMessage(msg, "delete");
    }

    async processEdit(oldMsg, newMsg) {
        if (newMsg.partial) {
            try {
                newMsg = await newMsg.fetch();
            } catch {
                return;
            }
        }

        if (!this.shouldProcessEdit(oldMsg, newMsg)) {
            return;
        }

        await this.processMessage(newMsg, "resubmit");
    }
}

export default MessageDispatcher;
