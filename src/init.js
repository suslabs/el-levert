import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import ConfigLoader from "./config/ConfigLoader.js";
import AuthLoader from "./config/AuthLoader.js";
import LoadStatus from "./config/LoadStatus.js";

import { LevertClient } from "./LevertClient.js";

const logger = createLogger(getDefaultLoggerConfig("init", false, true));

async function loadConfig() {
    const configLoader = new ConfigLoader(logger),
        authLoader = new AuthLoader(logger);

    let config, auth, loadStatus;

    [config, loadStatus] = await configLoader.load();
    if (loadStatus === LoadStatus.failed) {
        return [undefined, undefined];
    }

    [auth, loadStatus] = await authLoader.load();
    if (loadStatus === LoadStatus.failed) {
        return [undefined, undefined];
    }

    return [config, auth];
}

async function init() {
    const [config, auth] = await loadConfig();

    if (config === undefined || auth === undefined) {
        return;
    }

    logger.end();

    const client = new LevertClient(config, auth);
    await client.start();
}

export default init;
