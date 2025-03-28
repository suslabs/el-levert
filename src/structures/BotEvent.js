import Util from "../util/Util.js";

import EventError from "../errors/EventError.js";

class BotEvent {
    static defaultValues = {
        once: false
    };

    constructor(options) {
        if (typeof options.name !== "string") {
            throw new EventError("Event must have a name");
        }

        if (typeof options.listener !== "function") {
            throw new EventError("Event must have a listener function");
        }

        Util.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        this.registered = false;
    }

    register(client) {
        if (this.registered) {
            throw new EventError("Event has already been registered");
        }

        client = this.client ?? client;
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
