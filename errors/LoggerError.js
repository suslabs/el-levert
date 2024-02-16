class LoggerError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "LoggerError";
        this.message = message;
    }
}

export default LoggerError;
