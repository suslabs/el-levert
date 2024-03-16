class PermissionError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "PermissionErrorError";
        this.message = message;
    }
}

export default PermissionError;
