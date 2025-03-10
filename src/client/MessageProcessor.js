class MessageProcessor {
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

    async processEdit(msg) {
        await this.processMessage(msg, "resubmit");
    }
}

export default MessageProcessor;
