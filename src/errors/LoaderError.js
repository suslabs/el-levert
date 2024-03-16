class LoaderError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "LoaderError";
        this.message = message;
    }
}

export default LoaderError;
