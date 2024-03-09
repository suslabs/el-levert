import URL from "url";
import path from "path";

import BotEvent from "../structures/BotEvent.js";

import Util from "../util/Util.js";

class EventLoader {
    constructor(client, eventsDir, options = {}) {
        this.client = client;
        this.eventsDir = eventsDir;

        this.logger = options.logger;
        this.wrapFunc = options.wrapFunc;

        this.wrapEvents = options.wrapEvents ?? false;
        this.eventFileExtension = options.eventFileExtension ?? ".js";

        this.events = [];
    }

    getEventPaths() {
        if (typeof this.eventsDir === "undefined" || this.eventsDir.length < 1) {
            return [];
        }

        let files = Util.getFilesRecSync(this.eventsDir);
        files = files.filter(file => {
            const extension = path.extname(file);
            return extension === this.eventFileExtension;
        });

        return files;
    }

    wrapEvent(event) {
        let listener = event.listener;

        if (this.wrapEvents) {
            if (typeof this.wrapEvent === "undefined") {
                this.logger?.warn("Couldn't wrap event: " + event.name);
            } else {
                listener = this.wrapFunc(listener);
            }
        } else {
            this.logger?.info("Didn't wrap event: " + event.name);
        }

        event.listener = listener;
    }

    async loadEvent(eventPath) {
        eventPath = URL.pathToFileURL(eventPath);
        const eventProperties = (await import(eventPath)).default;

        if (typeof eventProperties === "undefined" || typeof eventProperties.name === "undefined") {
            return false;
        }

        const event = new BotEvent(eventProperties);

        this.wrapEvent(event);
        event.bind(this.client);

        this.events.push(event);
        return true;
    }

    async loadEvents() {
        this.logger?.info("Loading events...");
        const paths = this.getEventPaths();

        if (paths.length === 0) {
            this.logger?.info("Couldn't find any events.");
            return;
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
                this.logger?.error("Error occured while loading event: " + eventPath, err);
                bad++;
            }
        }

        this.logger?.info(`Loaded ${ok + bad} events. ${ok} successful, ${bad} failed.`);
    }

    removeListeners() {
        for (let i = 0; i < this.events.length; i++) {
            this.events[i].remove();
            delete this.events[i];
        }

        while (this.events.length > 0) {
            this.events.shift();
        }

        this.logger?.info("Removed all listeners.");
    }
}

export default EventLoader;
