class InteractionDispatcher {
    constructor(client) {
        this.client = client;
    }

    shouldProcess(interaction) {
        return interaction != null && !interaction.user.bot;
    }

    async processInteraction(interaction) {
        if (!this.shouldProcess(interaction)) {
            return false;
        }

        return await this.client.interactionHandler.execute(interaction);
    }

    async processCreate(interaction) {
        return await this.processInteraction(interaction);
    }
}

export default InteractionDispatcher;
