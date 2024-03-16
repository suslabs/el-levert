import BaseConfigLoader from "./BaseConfigLoader.js";

class ReactionsLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("reactions", logger, options);
    }

    modify(config) {
        if (typeof config.parans === "undefined") {
            config.parans = {};
        }
    }
}

export default ReactionsLoader;
