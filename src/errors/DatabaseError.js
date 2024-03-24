class DatabaseError extends Error {
    constructor(obj, ...args) {
        let message = "";

        if (typeof obj === "object") {
            message = obj.message;
        } else {
            message = obj;
        }

        super(message, ...args);

        this.name = "DatabaseError";
        this.message = message;

        if (typeof obj === "object") {
            this.code = obj.code;
            this.errno = obj.errno;
        }
    }
}

export default DatabaseError;
