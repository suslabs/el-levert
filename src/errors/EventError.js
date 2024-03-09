class EventError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);

        this.name = "EventError";
        this.message = message;
    }
}

export default EventError;
