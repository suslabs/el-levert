import BaseLoader from "./BaseLoader.js";

class ReactionsLoader extends BaseLoader {
    constructor(logger) {
        super("reactions", logger);
    }

    modify(config) {
        if (typeof config.parans === "undefined") {
            config.parans = {};
        }
    }
}

export default ReactionsLoader;
