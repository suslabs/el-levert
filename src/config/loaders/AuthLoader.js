import BaseConfigLoader from "./BaseConfigLoader.js";

class AuthLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("auth", logger, options);
    }

    modify(config) {
        if (typeof config.owner === "undefined") {
            config.owner = "0";
        }
    }
}

export default AuthLoader;
