import TextCommandContext from "./TextCommandContext.js";

import ObjectUtil from "../../../util/ObjectUtil.js";

class CommandContext extends TextCommandContext {
    constructor(data) {
        super(data);

        this.handler = this.data.handler ?? null;

        this.message = this.data.message ?? this.data.msg ?? null;
        this.author = this.data.author ?? this.message?.author;
        this.channel = this.data.channel ?? this.message?.channel;

        this.perm = this.data.perm;

        this.replyMsg = this.data.replyMsg ?? null;

        this.isEdit = this.data.isEdit ?? false;
        this.processingReplySent = this.data.processingReplySent ?? false;

        this.interactionContext = this.data.interactionContext ?? null;
    }

    clone(context, overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        context.replyMsg = overrides.replyMsg ?? this.replyMsg;
        context.isEdit = overrides.isEdit ?? this.isEdit;
        context.processingReplySent = overrides.processingReplySent ?? this.processingReplySent;

        return context;
    }

    get msg() {
        return this.message;
    }

    get interaction() {
        return this.interactionContext?.interaction ?? null;
    }

    get isInteraction() {
        return this.interactionContext !== null;
    }

    get isAuthor() {
        return this.data.isAuthor ?? this.interactionContext?.isAuthor ?? true;
    }

    getReply() {
        if (this.handler != null && typeof this.handler.getReply === "function") {
            return this.handler.getReply(this.msg);
        }

        return null;
    }

    async reply(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        if (this.ephemeral) {
            options.ephemeral ??= true;
        }

        this.markReplied();

        if (this.isInteraction) {
            return await this.interactionContext.reply(data, options);
        }

        if (this.handler != null) {
            return await this.handler.contextReply(this, data, options);
        }

        if (this.msg != null && typeof this.msg.reply === "function") {
            return await this.msg.reply(data, options);
        }
    }

    async update(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.markReplied();

        if (this.isInteraction) {
            return await this.interactionContext.update(data, options);
        }
    }

    async deferReply(options) {
        options = ObjectUtil.guaranteeObject(options);

        if (this.isInteraction) {
            return await this.interactionContext.deferReply(options);
        }
    }

    async deferUpdate(options) {
        options = ObjectUtil.guaranteeObject(options);

        if (this.isInteraction) {
            return await this.interactionContext.deferUpdate(options);
        }
    }

    async showModal(modal) {
        if (this.isInteraction) {
            return await this.interactionContext.showModal(modal);
        }
    }

    async edit(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.markReplied();
        return await this.handler?.editFromContext(this, data, options);
    }

    async deleteReply() {
        return await this.handler?.deleteReplyFromContext(this);
    }
}

export default CommandContext;
