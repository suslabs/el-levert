import createLogger from "./logger/CreateLogger.js";
import getDefaultLoggerConfig from "./logger/DefaultConfig.js";

import ConfigLoader from "./config/ConfigLoader.js";
import ReactionsLoader from "./config/ReactionsLoader.js";
import AuthLoader from "./config/AuthLoader.js";

import LoadStatus from "./config/BaseLoader/LoadStatus.js";

import { LevertClient } from "./LevertClient.js";

const logger = createLogger(getDefaultLoggerConfig("init", false, true));

function initLoaders() {
    const configLoader = new ConfigLoader(logger),
        reactionsLoader = new ReactionsLoader(logger),
        authLoader = new AuthLoader(logger);

    const loaders = [];
    loaders.push(configLoader);
    loaders.push(reactionsLoader);
    loaders.push(authLoader);

    return loaders;
}

async function loadConfig() {
    const loaders = initLoaders(),
        configs = {};

    for (const loader of loaders) {
        let [config, loadStatus] = await loader.load();

        if (loadStatus === LoadStatus.failed) {
            return undefined;
        }

        configs[loader.name] = config;
    }

    return configs;
}

async function init() {
    const configs = await loadConfig();

    if (typeof configs === "undefined") {
        return;
    }

    logger.end();

    const client = new LevertClient(configs);
    await client.start();
}

export default init;
