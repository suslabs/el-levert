class ReminderError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "ReminderError";
        this.message = message;
    }
}

export default ReminderError;
