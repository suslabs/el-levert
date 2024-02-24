import BaseLoader from "./BaseLoader/BaseLoader.js";

class AuthLoader extends BaseLoader {
    constructor(logger) {
        super("auth", logger);
    }

    modify(config) {
        if (typeof config.owner === "undefined") {
            config.owner = "";
        }
    }
}

export default AuthLoader;
