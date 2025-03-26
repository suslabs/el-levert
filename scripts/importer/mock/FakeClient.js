import ClientError from "../../../src/errors/ClientError.js";

let client;

class LevertClient {
    constructor(config, logger) {
        if (typeof client === "undefined") {
            client = this;
        } else {
            throw new ClientError("The client can only be constructed once");
        }

        this.config = config;
        this.reactions = {};

        this.logger = logger;
    }
}

function getClient() {
    return client;
}

function getLogger() {
    return client.logger;
}

export { LevertClient, getClient, getLogger };
