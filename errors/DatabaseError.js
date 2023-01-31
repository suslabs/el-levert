class DatabaseError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);
        
        this.name = "DatabaseError";
        this.message = message;
    }
}

export default DatabaseError;