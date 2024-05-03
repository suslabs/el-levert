import BotEvent from "../../structures/BotEvent.js";

import ObjectLoader from "../ObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class EventObjectLoader extends ObjectLoader {
    constructor(filePath, logger, options = {}) {
        super("event", filePath, logger, {
            throwOnFailure: true,
            ...options,
            type: null
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const event = new BotEvent(this.data);
        this.data = event;

        return LoadStatus.successful;
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.data.name}`;
    }
}

export default EventObjectLoader;
