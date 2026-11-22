class AIInteractionTarget {
    constructor(ctx) {
        this.ctx = ctx;
    }

    async reply(data) {
        return await this.ctx.reply(data);
    }

    async edit(data) {
        return await this.ctx.interaction.editReply(data);
    }
}

export default AIInteractionTarget;
