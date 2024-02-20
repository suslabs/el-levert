import BaseLoader from "./BaseLoader.js";

class AuthLoader extends BaseLoader {
    constructor(logger) {
        super("auth", "./config", logger);
    }
}

export default AuthLoader;
