import BaseLoader from "./BaseLoader.js";

class ConfigLoader extends BaseLoader {
    constructor(logger, options) {
        super("config", logger, options);
    }
}

export default ConfigLoader;
