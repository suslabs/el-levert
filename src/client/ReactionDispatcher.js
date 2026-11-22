class ReactionDispatcher {
    constructor(client) {
        this.client = client;
    }

    shouldProcess(user) {
        return !user.bot;
    }

    async processAdd(reaction, user) {
        if (!this.shouldProcess(user)) {
            return false;
        }

        return (await this.client.followUpHandler?.execute(reaction, user)) ?? false;
    }
}

export default ReactionDispatcher;
