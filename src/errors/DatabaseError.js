import CustomError from "./CustomError.js";

class DatabaseError extends CustomError {
    constructor(obj, ...args) {
        const message = typeof obj === "object" ? obj.message : obj;
        super(message, ...args);

        this.code = obj?.code;
        this.errno = obj?.errno;
    }
}

export default DatabaseError;
