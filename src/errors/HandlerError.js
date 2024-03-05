class HandlerError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "HandlerError";
        this.message = message;
    }
}

export default HandlerError;
