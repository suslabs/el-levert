import DirectoryLoader from "../DirectoryLoader.js";
import EventObjectLoader from "./EventObjectLoader.js";

import ArrayUtil from "../../util/ArrayUtil.js";

import LoadStatus from "../LoadStatus.js";

class EventLoader extends DirectoryLoader {
    constructor(dirPath, client, logger, options = {}) {
        super("event", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            dataField: "events",
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

        this._getEvents();
        this._wrapEvents();
        this._registerEvents();

        return LoadStatus.successful;
    }

    removeListeners() {
        this.deleteAllData();

        ArrayUtil.wipeArray(this.events, event => event.unregister());
        delete this.events;

        this.logger?.info("Removed all event listeners.");
    }

    getLoadingMessage() {
        return `Loading ${this.name}s...`;
    }

    getLoadedMessage() {
        return `Loaded ${this.name}s successfully.`;
    }

    _getEvents() {
        if (typeof this.events === "undefined") {
            const events = Array.from(this.data.values());
            this.events = events;
        }

        return this.events;
    }

    _wrapEvent(event) {
        let listener = event.listener;

        if (this.shouldWrap) {
            if (typeof this.wrapFunc !== "function") {
                this.failure("Couldn't wrap event: " + event.name, undefined, "warn");
            } else {
                listener = this.wrapFunc(listener);
            }
        }

        event.listener = listener;
    }

    _wrapEvents() {
        for (const event of this.events) {
            this._wrapEvent(event);
        }
    }

    _registerEvents() {
        this.logger?.info("Registering events...");

        let n = 0;

        for (const event of this.events) {
            event.register(this.client);
            n++;
        }

        this.logger?.info(`Registered ${n} events.`);
    }
}

export default EventLoader;
