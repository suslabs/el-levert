class VMError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "VMError";
        this.message = message;
    }
}

export default VMError;
