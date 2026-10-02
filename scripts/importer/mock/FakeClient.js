import ObjectUtil from "../../../src/util/ObjectUtil.js";

import ClientError from "../../../src/errors/ClientError.js";

let client = null;

class LevertClient {
    constructor(config, logger, options) {
        if (client === null) {
            client = this;
        } else {
            throw new ClientError("The client can only be constructed once");
        }

        options = ObjectUtil.guaranteeObject(options);

        this.config = {
            ...config,
            enableAuditLog: options.enableAuditLog ?? false
        };

        this.reactions = {};

        this.logger = logger;
    }
}

function getClient() {
    return client;
}

function getConfig() {
    return client?.config ?? null;
}

function getEmoji(name) {
    return getConfig()?.emoji?.[name] ?? "";
}

function getLogger() {
    return client?.logger ?? null;
}

function _resetClient() {
    client = null;
}

export { LevertClient, getClient, getConfig, getEmoji, getLogger, _resetClient };
