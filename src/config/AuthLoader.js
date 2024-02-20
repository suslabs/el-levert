import BaseLoader from "./BaseLoader.js";

class AuthLoader extends BaseLoader {
    constructor(logger) {
        super("auth", logger);
    }
}

export default AuthLoader;
