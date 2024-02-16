class ClientError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ClientError";
        this.message = message;
    }
}

export default ClientError;
