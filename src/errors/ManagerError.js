class ManagerError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ManagerError";
        this.message = message;
    }
}

export default ManagerError;
