class ManevraError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ManevraError";
        this.message = message;
    }
}

export default ManevraError;
