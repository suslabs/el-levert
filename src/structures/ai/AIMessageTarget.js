class AIMessageTarget {
    constructor(msg) {
        this.msg = msg;
        this.sent = null;
    }

    async reply(data) {
        this.sent = await this.msg.reply(data);
        return this.sent;
    }

    async edit(data) {
        this.sent = await this.sent.edit(data);
        return this.sent;
    }
}

export default AIMessageTarget;
