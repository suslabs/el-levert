class MessageProcessor {
    constructor(client) {
        this.client = client;
        this.executeAllHandlers = client.executeAllHandlers;
    }

    shouldProcess(msg) {
        if (msg.author.bot) {
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

    async processEdit(msg) {
        await this.processMessage(msg, "resubmit");
    }
}

export default MessageProcessor;
