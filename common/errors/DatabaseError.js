import CustomError from "./CustomError.js";

import TypeTester from "../util/TypeTester.js";

class DatabaseError extends CustomError {
    constructor(obj, ...args) {
        const message = TypeTester.isObject(obj) ? obj.message : obj;
        super(message, ...args);

        this.code = obj?.code;
        this.errno = obj?.errno;
    }
}

export default DatabaseError;
