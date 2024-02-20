import BaseLoader from "./BaseLoader.js";

class ConfigLoader extends BaseLoader {
    constructor(logger) {
        super("config", "./config", logger);
    }
}

export default ConfigLoader;
