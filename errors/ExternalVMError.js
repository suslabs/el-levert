class ExternalVMError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);
        
        this.name = "ExternalVMError";
        this.message = message;
    }
}

export default ExternalVMError;