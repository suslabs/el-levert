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
    registerEvents: (source, target, events) => {
        for (const event of Object.values(events)) {
            DatabaseUtil.registerEvent(source, target, event);
        }
    }
};

export default DatabaseUtil;
