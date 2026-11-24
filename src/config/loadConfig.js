import ConfigLoader from "../loaders/config/ConfigLoader.js";
import ReactionsLoader from "../loaders/config/ReactionsLoader.js";
import QuestbooksLoader from "../loaders/config/QuestbooksLoader.js";
import AuthLoader from "../loaders/config/AuthLoader.js";

import { LoadStatus } from "../loaders/LoadStatus.js";

const loaderConfig = {
    throwOnFailure: false
};

function initConfigLoaders(logger) {
    const loaders = [];

    loaders.push(new ConfigLoader(logger, loaderConfig));
    loaders.push(new ReactionsLoader(logger, loaderConfig));
    loaders.push(new QuestbooksLoader(logger, loaderConfig));

    return loaders;
}

async function loadConfig(logger) {
    const loaders = initConfigLoaders(logger),
        configs = {};

    for (const loader of loaders) {
        const [config, loadStatus] = await loader.load();

        if (loadStatus === LoadStatus.failed) {
            return null;
        }

        configs[loader.name] = config;
    }

    return configs;
}

async function loadAuth(logger) {
    const loader = new AuthLoader(logger, loaderConfig);

    const [auth, loadStatus] = await loader.load();

    if (loadStatus === LoadStatus.failed) {
        return null;
    }

    return auth;
}

async function loadBotConfig(logger) {
    const configs = await loadConfig(logger);

    if (configs === null) {
        return null;
    }

    const auth = await loadAuth(logger);

    if (auth === null) {
        return null;
    }

    return { configs, auth };
}

export { loadConfig, loadAuth, loadBotConfig };
