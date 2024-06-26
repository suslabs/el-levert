import EventError from "../errors/EventError.js";

import Util from "../util/Util.js";

const defaultValues = {
    once: false
};

class BotEvent {
    static defaultValues = defaultValues;

    constructor(options) {
        if (typeof options.name === "undefined") {
            throw new EventError("Event must have a name");
        }

        if (typeof options.listener === "undefined") {
            throw new EventError("Event must have a listener");
        }

        Util.setValuesWithDefaults(this, options, defaultValues);

        this.registered = false;
    }

    register(client) {
        if (this.registered) {
            throw new EventError("Event has already been registered");
        }

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
            throw new EventError("Event hasn't been registered");
        }

        this.client.removeListener(this.name, this.listener);
        this.registered = false;
    }
}

export default BotEvent;
