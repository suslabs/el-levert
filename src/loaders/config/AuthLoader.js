import BaseConfigLoader from "./BaseConfigLoader.js";

import Util from "../../util/Util.js";

class AuthLoader extends BaseConfigLoader {
    constructor(logger, options) {
        super("auth", logger, options);
    }

    modify(config) {
        if (typeof config.owner !== "string" || Util.empty(config.owner)) {
            config.owner = "0";
        }
    }
}

export default AuthLoader;
