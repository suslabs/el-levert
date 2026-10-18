import BaseCommandContext from "./BaseCommandContext.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";

class InteractionContext extends BaseCommandContext {
    static defaultValues = {
        ...BaseCommandContext.defaultValues,
        interaction: null,
        handler: null,
        session: null,
        commandContext: null,
        user: null,
        author: null,
        channel: null,
        guild: null,
        message: null,
        customId: "",
        action: "",
        isAuthor: true,
        ephemeral: false,
        updated: false
    };

    static dataProps = [
        ...BaseCommandContext.dataProps,
        "interaction",
        "handler",
        "session",
        "commandContext",
        "user",
        "author",
        "channel",
        "guild",
        "message",
        "customId",
        "action",
        "isAuthor",
        "ephemeral",
        "updated"
    ];

    constructor(data) {
        super(data);

        data = ObjectUtil.guaranteeObject(data);

        this.commandContext ??= this.session?.context ?? null;
        this._parentContext = data._parentContext ?? this.commandContext ?? null;

        this.user = this.interaction?.user ?? this.user ?? null;
        this.author = this.user;
        this.channel = this.interaction?.channel ?? this.channel ?? null;
        this.guild = this.interaction?.guild ?? this.guild ?? null;
        this.message = this.interaction?.message ?? this.message ?? null;

        if (this.interaction != null && Util.empty(this.customId)) {
            this.customId = this.interaction.customId ?? "";
        }

        if (typeof data.isAuthor === "undefined" && this.session != null && this.user != null) {
            this.isAuthor = this.user.id === this.session.authorId;
        }
    }

    get isInteraction() {
        return true;
    }

    clone(context, overrides) {
        overrides = ObjectUtil.guaranteeObject(overrides);

        context.updated = overrides.updated ?? this.updated;

        return context;
    }

    async reply(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        if (this.ephemeral || (this.commandContext != null && this.commandContext.ephemeral)) {
            options.ephemeral ??= true;
        }

        this.markReplied();

        if (this.handler != null) {
            return await this.handler.interactionReply(this.interaction, data, options);
        }
    }

    async update(data, options) {
        options = ObjectUtil.guaranteeObject(options);

        this.updated = true;
        this.markReplied();

        if (this.handler != null) {
            return await this.handler.interactionUpdate(this.interaction, data, options);
        }
    }

    async deferReply(options) {
        options = ObjectUtil.guaranteeObject(options);
        return await this.interaction.deferReply(options);
    }

    async deferUpdate(options) {
        options = ObjectUtil.guaranteeObject(options);
        return await this.interaction.deferUpdate(options);
    }

    async showModal(modal) {
        return await this.interaction.showModal(modal);
    }
}

export default InteractionContext;
