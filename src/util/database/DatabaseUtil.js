import crypto from "node:crypto";

const DatabaseUtil = {
    registerEvent: (source, target, event) => {
        source.on(event, (...args) => target.emit(event, ...args));
    },

    removeEvent: (source, target, event) => {
        source.removeAllListeners(event);
        target.removeAllListeners(event);
    },

    registerEvents: (source, target, events) => {
        for (const event of Object.values(events)) {
            if (event !== "promiseError") {
                DatabaseUtil.registerEvent(source, target, event);
            }
        }
    },

    removeEvents: (source, target, events) => {
        for (const event of Object.values(events)) {
            DatabaseUtil.removeEvent(source, target, event);
        }
    },

    registerPrefixedEvents: (source, target, prefix, events) => {
        for (const event of Object.values(events)) {
            const name = `${prefix}_${event}`;
            DatabaseUtil.registerEvent(source, target, name);
        }
    },

    removePrefixedEvents: (source, target, prefix, events) => {
        for (const event of Object.values(events)) {
            const name = `${prefix}_${event}`;
            DatabaseUtil.removeEvent(source, target, name);
        }
    },

    getEventId() {
        return crypto.randomBytes(4).toString("hex");
    }
};

export default DatabaseUtil;
