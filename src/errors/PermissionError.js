class PermissionError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "PermissionError";
        this.message = message;
    }
}

export default PermissionError;
