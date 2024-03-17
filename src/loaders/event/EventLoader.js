import DirectoryLoader from "../DirectoryLoader.js";
import EventObjectLoader from "./EventObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class EventLoader extends DirectoryLoader {
    constructor(dirPath, client, logger, options = {}) {
        super("event", dirPath, logger, {
            ...options,
            fileLoaderClass: EventObjectLoader,
            throwOnFailure: true
        });

        this.client = client;

        this.shouldWrap = options.wrapEvents ?? false;
        this.wrapFunc = options.wrapFunc;
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        const events = Array.from(this.data.values());
        this.data = events;

        this.wrapEvents();
        this.registerEvents();

        return LoadStatus.successful;
    }

    wrapEvent(event) {
        let listener = event.listener;

        if (this.shouldWrap) {
            if (typeof this.wrapFunc !== "function") {
                this.failure("Couldn't wrap event: " + event.name, undefined, "warn");
            } else {
                listener = this.wrapFunc(listener);
            }
        } else {
            this.logger?.info("Didn't wrap event: " + event.name);
        }

        event.listener = listener;
    }

    wrapEvents() {
        for (const event of this.data) {
            this.wrapEvent(event);
        }
    }

    registerEvents() {
        this.logger?.info("Registering events...");

        let n = 0;

        for (const event of this.data) {
            event.register(this.client);
            n++;
        }

        this.logger?.info(`Registered ${n} events.`);
    }

    removeListeners() {
        for (let i = 0; i < this.data.length; i++) {
            this.data[i].unregister();
            delete this.data[i];
        }

        while (this.data.length > 0) {
            this.data.shift();
        }

        this.logger?.info("Removed all listeners.");
    }
}

export default EventLoader;
