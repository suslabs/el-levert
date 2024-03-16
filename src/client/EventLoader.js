import path from "path";

import BotEvent from "../structures/BotEvent.js";
import EventError from "../errors/EventError.js";

import Util from "../util/Util.js";

class EventLoader {
    constructor(client, eventsDir, options = {}) {
        this.client = client;
        this.eventsDir = eventsDir;

        this.logger = options.logger;
        this.throwOnFailure = options.throwOnFailure ?? true;
        this.wrapFunc = options.wrapFunc;

        this.wrapEvents = options.wrapEvents ?? false;
        this.eventFileExtension = options.eventFileExtension ?? ".js";

        this.events = [];
    }

    getEventPaths() {
        if (typeof this.eventsDir === "undefined" || this.eventsDir.length < 1) {
            throw new EventError("Invalid events directory");
        }

        let files;

        try {
            files = Util.getFilesRecSync(this.eventsDir);
        } catch (err) {
            if (err.code === "ENOENT") {
                throw new EventError("Couldn't find the events directory");
            }

            throw err;
        }

        files = files.filter(file => {
            const extension = path.extname(file);
            return extension === this.eventFileExtension;
        });

        return files;
    }

    wrapEvent(event) {
        let listener = event.listener;

        if (this.wrapEvents) {
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

    async loadEvent(eventPath) {
        const eventProperties = await Util.import(eventPath);

        if (typeof eventProperties === "undefined" || typeof eventProperties.name === "undefined") {
            return false;
        }

        const event = new BotEvent(eventProperties);

        this.wrapEvent(event);
        event.register(this.client);

        this.events.push(event);
        return true;
    }

    async loadEvents() {
        this.logger?.info("Loading events...");
        let paths;

        try {
            paths = this.getEventPaths();
        } catch (err) {
            if (err.name === "EventError") {
                this.failure(err.message + ".");
            } else {
                this.failure(err, "Error occured while reading events directory:");
            }

            return { total: 0, ok: 0, bad: 0 };
        }

        if (paths.length === 0) {
            this.failure("Couldn't find any events.");
            return { total: 0, ok: 0, bad: 0 };
        }

        let ok = 0,
            bad = 0;

        for (const eventPath of paths) {
            try {
                const res = await this.loadEvent(eventPath);

                if (res === true) {
                    ok++;
                }
            } catch (err) {
                this.failure(err, "Error occured while loading event: " + eventPath);
                bad++;
            }
        }

        const total = ok + bad;

        if (total === 0) {
            this.failure("Couldn't load any events.");
        } else {
            this.logger?.info(`Loaded ${total} events. ${ok} successful, ${bad} failed.`);
        }

        return { total, ok, bad };
    }

    removeListeners() {
        for (let i = 0; i < this.events.length; i++) {
            this.events[i].unregister();
            delete this.events[i];
        }

        while (this.events.length > 0) {
            this.events.shift();
        }

        this.logger?.info("Removed all listeners.");
    }

    failure(err, loggerMsg, logLevel = "error") {
        if (this.throwOnFailure) {
            if (typeof err === "string") {
                throw new EventError(err);
            } else {
                throw err;
            }
        }

        if (typeof loggerMsg !== "undefined") {
            this.logger?.log(logLevel, loggerMsg, err);
        } else {
            this.logger?.log(logLevel, err);
        }
    }
}

export default EventLoader;
