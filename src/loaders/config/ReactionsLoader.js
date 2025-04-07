import BaseConfigLoader from "./BaseConfigLoader.js";

import TypeTester from "../../util/TypeTester.js";

class ReactionsLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("reactions", logger, options);
    }

    modify(config) {
        if (!TypeTester.isObject(config.parens)) {
            config.parens = {};
        }

        if (!TypeTester.isObject(config.funnyWords)) {
            config.funnyWords = {};
        }
    }
}

export default ReactionsLoader;
