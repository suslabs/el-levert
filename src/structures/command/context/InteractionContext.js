import ObjectUtil from "../../../util/ObjectUtil.js";

class InteractionContext {
    constructor(data) {
        data = ObjectUtil.guaranteeObject(data);
        this.data = data;

        this.interaction = data.interaction ?? null;
        this.handler = data.handler ?? null;
        this.session = data.session ?? null;
        this.commandContext = data.commandContext ?? (this.session != null ? this.session.context : null);

        this.user = this.interaction != null ? this.interaction.user : null;
        this.author = this.user;
        this.channel = this.interaction != null ? this.interaction.channel : null;
        this.guild = this.interaction != null ? this.interaction.guild : null;
        this.message = this.interaction != null ? this.interaction.message : null;

        this.customId = this.interaction != null ? this.interaction.customId : "";
        this.action = data.action ?? "";

        this.isAuthor =
            data.isAuthor ??
            (this.session != null && this.user != null ? this.user.id === this.session.authorId : true);

        this.replied = false;
        this.updated = false;
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
