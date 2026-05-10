import TextCommandContext from "./TextCommandContext.js";
import TypeTester from "../../../util/TypeTester.js";

class CommandContext extends TextCommandContext {
    constructor(data) {
        super(data);

        this.handler = this.data.handler ?? null;

        this.message = this.data.message ?? this.data.msg ?? null;
        this.author = this.data.author ?? this.message?.author;
        this.channel = this.data.channel ?? this.message?.channel;

        this.perm = this.data.perm;
    }

    get msg() {
        return this.message;
    }

    async reply(data, options) {
        options = TypeTester.isObject(options) ? options : {};

        this.markReplied();
        return await this.handler?.contextReply?.(this, data, options);
    }

    async edit(data, options) {
        options = TypeTester.isObject(options) ? options : {};

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
