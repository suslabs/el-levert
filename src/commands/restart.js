import createLogger from "../logger/CreateLogger.js";
import getDefaultLoggerConfig from "../logger/DefaultConfig.js";

import loadConfig from "../config/loadConfig.js";
import { getClient } from "../LevertClient.js";

function setupLogger() {
    const config = getDefaultLoggerConfig("reload", false, true);
    return createLogger(config);
}

async function configReloader() {
    const logger = setupLogger();

    logger.info("Reloading configs...");
    const configs = await loadConfig(logger);

    logger.end();
    return configs;
}

function rebindMessage(msg, client) {
    const id = msg.channel.id;
    delete msg.channel;

    const channel = client.channels.cache.get(id);
    Object.defineProperty(msg, "channel", {
        value: channel
    });
}

export default {
    name: "restart",
    aliases: ["reload"],
    load: function () {
        this.allowed = getClient().permManager.ownerLevel;
    },
    handler: async (args, msg, perm) => {
        await getClient().restart(configReloader);

        rebindMessage(msg, getClient().client);

        return ":white_check_mark: Restarted client!";
    }
};
