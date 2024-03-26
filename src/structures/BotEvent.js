import EventError from "../errors/EventError.js";

const defaultValues = {
    once: false,
    registered: false
};

class BotEvent {
    constructor(options) {
        if (typeof options.name === "undefined") {
            throw new EventError("Event must have a name");
        }

        if (typeof options.listener === "undefined") {
            throw new EventError("Event must have a listener");
        }

        Object.assign(this, {
            ...defaultValues,
            ...options
        });
    }

    register(client) {
        this.client = client;

        if (this.once) {
            client.once(this.name, this.listener);
        } else {
            client.on(this.name, this.listener);
        }

        this.registered = true;
    }

    unregister() {
        if (!this.registered) {
            throw new EventError("Event isn't registered");
        }

        this.client.removeAllListeners(this.name);
        this.registered = false;
    }
}

export default BotEvent;
