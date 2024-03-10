class ValidationError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ValidationError";
        this.message = message;
    }
}

export default ValidationError;
