import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import loadConfig from "./config/loadConfig.js";

import { LevertClient } from "./LevertClient.js";

const logger = createLogger(getDefaultLoggerConfig("init", false, true));

async function init() {
    const configs = await loadConfig(logger);

    if (typeof configs === "undefined") {
        return;
    }

    const client = new LevertClient(configs);

    logger.info("Initialized client.");
    logger.end();

    await client.start();
}

export default init;
