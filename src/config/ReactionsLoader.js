import BaseLoader from "./BaseLoader.js";

class ReactionsLoader extends BaseLoader {
    constructor(logger) {
        super("reactions", logger);
    }
}

export default ReactionsLoader;
