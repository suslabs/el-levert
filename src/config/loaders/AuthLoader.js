import BaseLoader from "./BaseLoader.js";

class AuthLoader extends BaseLoader {
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
