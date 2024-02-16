class CommandError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "CommandError";
        this.message = message;
    }
}

export default CommandError;
