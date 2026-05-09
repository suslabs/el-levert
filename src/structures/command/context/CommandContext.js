import TextCommandContext from "./TextCommandContext.js";

class CommandContext extends TextCommandContext {
    constructor(data = {}) {
        super(data);

        this.handler = data.handler ?? null;

        this.message = data.message ?? data.msg ?? null;
        this.author = data.author ?? this.message?.author;
        this.channel = data.channel ?? this.message?.channel;

        this.perm = data.perm;
    }

    get msg() {
        return this.message;
    }

    async reply(data, options = {}) {
        this.markReplied();
        return await this.handler?.contextReply?.(this, data, options);
    }

    async edit(data, options = {}) {
        this.markReplied();
        return await this.handler?.editFromContext?.(this, data, options);
    }

    async deleteReply() {
        return await this.handler?.deleteReplyFromContext?.(this);
    }

    getReply() {
        return this.handler?.getReply?.(this.msg) ?? null;
    }
}

export default CommandContext;
