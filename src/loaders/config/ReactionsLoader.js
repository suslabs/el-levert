import BaseConfigLoader from "./BaseConfigLoader.js";

import { isObject } from "../../util/misc/TypeTester.js";

class ReactionsLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("reactions", logger, options);
    }

    modify(config) {
        if (!isObject(config.parens)) {
            config.parens = {};
        }

        if (!isObject(config.funnyWords)) {
            config.funnyWords = {};
        }
    }
}

export default ReactionsLoader;
