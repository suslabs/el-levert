import ConfigLoader from "./loaders/ConfigLoader.js";
import ReactionsLoader from "./loaders/ReactionsLoader.js";
import AuthLoader from "./loaders/AuthLoader.js";

import LoadStatus from "./loaders/LoadStatus.js";

const loaderConfig = {
    throwOnFailure: false
};

function initLoaders(logger) {
    const configLoader = new ConfigLoader(logger, loaderConfig),
        reactionsLoader = new ReactionsLoader(logger, loaderConfig),
        authLoader = new AuthLoader(logger, loaderConfig);

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
