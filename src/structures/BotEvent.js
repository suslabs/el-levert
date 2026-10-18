import BaseStructure from "./BaseStructure.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import EventError from "../errors/EventError.js";

class BotEvent extends BaseStructure {
    static defaultValues = {
        once: false
    };

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        if (!Util.nonemptyString(options.name)) {
            throw new EventError("Event must have a name");
        } else if (typeof options.listener !== "function") {
            throw new EventError("Event must have a listener function");
        }

        super(options);

        this.registered = false;
    }

    register(client) {
        if (this.registered) {
            throw new EventError("Event has already been registered");
        }

        client = this.client ?? client;
        this.client = client;

        const listenerFunc = this.once ? client.once : client.on;
        listenerFunc.call(client, this.name, this.listener);

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
