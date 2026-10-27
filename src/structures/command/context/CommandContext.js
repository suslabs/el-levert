import TextCommandContext from "./TextCommandContext.js";

import ObjectUtil from "../../../util/ObjectUtil.js";

class CommandContext extends TextCommandContext {
    static defaultValues = {
        ...TextCommandContext.defaultValues,
        handler: null,
        message: null,
        author: null,
        channel: null,
        perm: null,
        replyMsg: null,
        isEdit: false,
        processingReplySent: false,
        interactionContext: null
    };

    static dataProps = [
        ...TextCommandContext.dataProps,
        "handler",
        "message",
        "author",
        "channel",
        "perm",
        "replyMsg",
        "isEdit",
        "processingReplySent",
        "interactionContext"
    ];

    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);

        // eslint-disable-next-line no-unused-vars, unused-imports/no-unused-vars
        const { interaction, isInteraction, isAuthor, msg, ...rest } = data;

        super(rest);
        this.data = data;

        this.message = this.message ?? data.msg ?? null;
        this.author = this.author ?? this.message?.author;
        this.channel = this.channel ?? this.message?.channel;

        this._processingAborter = data._processingAborter ?? new AbortController();
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

    get guildId() {
        return this.message?.guildId ?? this.channel?.guildId ?? this.interaction?.guildId ?? null;
    }

    get guild() {
        return this.message?.guild ?? this.channel?.guild ?? this.interaction?.guild ?? null;
    }

    get processingSignal() {
        return this._processingAborter.signal;
    }

    get processingAborted() {
        return this._processingAborter.signal.aborted;
    }

    clone(context, overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        context.replyMsg = overrides.replyMsg ?? this.replyMsg;
        context.isEdit = overrides.isEdit ?? this.isEdit;
        context.processingReplySent = overrides.processingReplySent ?? this.processingReplySent;
        context._processingAborter = overrides._processingAborter ?? this._processingAborter;
        context.interactionContext = overrides.interactionContext ?? this.interactionContext;

        return context;
    }

    getReply() {
        if (this.handler != null && typeof this.handler.getReply === "function") {
            return this.handler.getReply(this.msg);
        }

        return null;
    }

    abortProcessing() {
        this._processingAborter.abort();
        return this;
    }

    async sendProcessingReply(data) {
        if (this.replied || this.processingReplySent || this.processingAborted) {
            return null;
        }

        this.processingReplySent = true;

        if (this.handler != null) {
            return await this.handler.reply(this.msg, data, {
                signal: this.processingSignal,
                deleteOnAbort: true
            });
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
        } else if (this.handler != null) {
            return await this.handler.contextReply(this, data, options);
        } else if (this.msg != null) {
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
