import BaseLoader from "./BaseLoader.js";

class ReactionsLoader extends BaseLoader {
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
