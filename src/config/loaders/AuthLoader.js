import BaseLoader from "./BaseLoader.js";

class AuthLoader extends BaseLoader {
    constructor(logger) {
        super("auth", logger);
    }

    modify(config) {
        if (typeof config.owner === "undefined") {
            config.owner = "0";
        }
    }
}

export default AuthLoader;
