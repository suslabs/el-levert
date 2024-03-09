import EventError from "../errors/EventError.js";

const defaultValues = {
    once: false
};

class BotEvent {
    constructor(options) {
        if (typeof options.name === "undefined") {
            throw new EventError("Event must have a name.");
        }

        if (typeof options.listener === "undefined") {
            throw new EventError("Event must have a listener.");
        }

        Object.assign(this, {
            ...defaultValues,
            ...options
        });
    }

    bind(client) {
        this.client = client;

        if (this.once) {
            client.once(this.name, this.listener);
        } else {
            client.on(this.name, this.listener);
        }
    }

    remove() {
        this.client.removeAllListeners(this.name);
    }
}

export default BotEvent;
