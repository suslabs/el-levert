import Command from "../../structures/Command.js";

import ObjectLoader from "../ObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class CommandObjectLoader extends ObjectLoader {
    constructor(filePath, logger, options = {}) {
        super("command", filePath, logger, {
            throwOnFailure: false,
            ...options,
            type: null
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const command = new Command({
            ...this.data,
            prefix: this.parentLoader.prefix
        });

        this.data = command;

        let shouldLoad;

        if (typeof command.load === "function") {
            try {
                shouldLoad = await command.load();
            } catch (err) {
                return this.failure(err, "Error occured while loading command:");
            }
        }

        if (shouldLoad ?? true) {
            return LoadStatus.successful;
        } else {
            return LoadStatus.ignore;
        }
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.data.name}`;
    }

    getIgnoredMessage() {
        return `Didn't load ${this.getName()}: ${this.data.name}`;
    }
}

export default CommandObjectLoader;
