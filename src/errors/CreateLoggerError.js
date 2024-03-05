class CreateLoggerError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "CreateLoggerError";
        this.message = message;
    }
}

export default CreateLoggerError;
