import CustomError from "./CustomError.js";

class RefError extends CustomError {
    constructor(message = "", ref, ...args) {
        super(message, ...args);
        this.ref = ref;
    }
}

export default RefError;
