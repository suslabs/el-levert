import BaseConfigLoader from "./BaseConfigLoader.js";

class ConfigLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("config", logger, options);
    }
}

export default ConfigLoader;
