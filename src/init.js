import createLogger from "./logger/createLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultLoggerConfig.js";

import loadConfig from "./config/loadConfig.js";
import { LevertClient } from "./LevertClient.js";

const loggerName = "init",
    logLevel = "info";

function setupLogger() {
    const config = getDefaultLoggerConfig(loggerName, null, true, logLevel);
    return createLogger(config);
}

async function init() {
    const logger = setupLogger();

    const configs = await loadConfig(logger);

    if (configs === null) {
        return;
    }

    const client = new LevertClient(configs);

    logger.info("Initialized client.");
    logger.end();

    await client.start();
}

export default init;
