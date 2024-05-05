class LoggerError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "CreateLoggerError";
        this.message = message;
    }
}

export default LoggerError;
