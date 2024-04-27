import createLogger from "./logger/createLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultLoggerConfig.js";

import loadConfig from "./config/loadConfig.js";
import { LevertClient } from "./LevertClient.js";

function setupLogger() {
    const config = getDefaultLoggerConfig("init", false, true);
    return createLogger(config);
}

async function init() {
    const logger = setupLogger();

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
