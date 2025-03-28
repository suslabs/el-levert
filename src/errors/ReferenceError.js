import CustomError from "./CustomError.js";

class ReferenceError extends CustomError {
    constructor(message = "", ref, ...args) {
        super(message, ...args);
        this.ref = ref;
    }
}

export default ReferenceError;
