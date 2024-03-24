import DirectoryLoader from "../DirectoryLoader.js";
import EventObjectLoader from "./EventObjectLoader.js";
import LoadStatus from "../LoadStatus.js";

class EventLoader extends DirectoryLoader {
    constructor(dirPath, client, logger, options = {}) {
        super("event", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            fileLoaderClass: EventObjectLoader
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

        this.getEvents();

        this.wrapEvents();
        this.registerEvents();

        return LoadStatus.successful;
    }

    getEvents() {
        const events = Array.from(this.data.values());

        this.events = events;
        this.data = events;
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
        for (const event of this.events) {
            this.wrapEvent(event);
        }
    }

    registerEvents() {
        this.logger?.info("Registering events...");

        let n = 0;

        for (const event of this.events) {
            event.register(this.client);
            n++;
        }

        this.logger?.info(`Registered ${n} events.`);
    }

    removeListeners() {
        for (let i = 0; i < this.events.length; i++) {
            this.events[i].unregister();

            delete this.events[i];
            delete this.data[i];
        }

        while (this.events.length > 0) {
            this.events.shift();
            this.data.shift();
        }

        this.logger?.info("Removed all listeners.");
    }
}

export default EventLoader;
