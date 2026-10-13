import BaseConfigLoader from "./BaseConfigLoader.js";

import DefaultReactionsConfig from "../../config/DefaultReactionsConfig.js";

import TypeTester from "../../util/TypeTester.js";

class ReactionsLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("reactions", logger, options);
    }

    modify(config) {
        if (!TypeTester.isObject(config.parens)) {
            config.parens = DefaultReactionsConfig.parens;
        }

        if (!Array.isArray(config.funnyWords)) {
            config.funnyWords = DefaultReactionsConfig.funnyWords;
        }
    }
}

export default ReactionsLoader;
