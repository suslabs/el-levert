import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";

import EventError from "../errors/EventError.js";

class BotEvent {
    static defaultValues = {
        once: false
    };

    constructor(options) {
        if (!Util.nonemptyString(options.name)) {
            throw new EventError("Event must have a name");
        } else if (typeof options.listener !== "function") {
            throw new EventError("Event must have a listener function");
        }

        ObjectUtil.setValuesWithDefaults(this, options, this.constructor.defaultValues);

        this.registered = false;
    }

    getData(prefix = "", nullable = true, props = null) {
        const data = ObjectUtil.filterObject(this, key => (props == null ? !key.startsWith("_") : props.includes(key)));

        if (nullable) {
            for (const prop of this.constructor._nullableDataProps.filter(
                prop => props == null || props.includes(prop)
            )) {
                data[prop] ||= null;
            }
        }

        return Object.fromEntries(Object.entries(data).map(entry => [prefix + entry[0], entry[1]]));
    }

    static _nullableDataProps = [];

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
