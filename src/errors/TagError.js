import CustomError from "./CustomError.js";

class TagError extends CustomError {
    constructor(message = "", ref, ...args) {
        super(message, ...args);

        this.ref = ref;
    }
}

export default TagError;
