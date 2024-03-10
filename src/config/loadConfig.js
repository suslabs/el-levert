import ConfigLoader from "./loaders/ConfigLoader.js";
import ReactionsLoader from "./loaders/ReactionsLoader.js";
import AuthLoader from "./loaders/AuthLoader.js";

import LoadStatus from "./loaders/LoadStatus.js";

function initLoaders(logger) {
    const configLoader = new ConfigLoader(logger),
        reactionsLoader = new ReactionsLoader(logger),
        authLoader = new AuthLoader(logger);

    const loaders = [];
    loaders.push(configLoader);
    loaders.push(reactionsLoader);
    loaders.push(authLoader);

    return loaders;
}

async function loadConfig(logger) {
    const loaders = initLoaders(logger),
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

export default loadConfig;
