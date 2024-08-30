import CustomError from "./CustomError.js";

class DatabaseError extends CustomError {
    constructor(obj, ...args) {
        let message = "";

        if (typeof obj === "object") {
            message = obj.message;
        } else {
            message = obj;
        }

        super(message, ...args);

        this.code = obj?.code;
        this.errno = obj?.errno;
    }
}

export default DatabaseError;
