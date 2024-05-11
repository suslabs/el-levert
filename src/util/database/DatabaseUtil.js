import mysql from "mysql";

const DatabaseUtil = {
    escape: (value, ...args) => {
        return mysql.escape(value, ...args);
    },

    escapeId: (value, ...args) => {
        return mysql.escapeId(value, ...args);
    },

    format: (sql, values, ...args) => {
        return mysql.format(sql, values, ...args);
    },

    raw: sql => {
        return mysql.raw(sql);
    },

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
    }
};

export default DatabaseUtil;
