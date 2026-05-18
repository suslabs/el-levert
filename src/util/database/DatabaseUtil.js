import crypto from "node:crypto";

import sqlite from "sqlite3";

import DatabaseError from "../../errors/DatabaseError.js";

const eventValuesCache = new WeakMap();

const DatabaseUtil = Object.freeze({
    getEventValues: events => {
        let values = eventValuesCache.get(events);

        if (values == null) {
            values = Object.freeze(Object.values(events));
            eventValuesCache.set(events, values);
        }

        return values;
    },

    registerEvent: (source, target, event) => {
        source.on(event, (...args) => target.emit(event, ...args));
    },

    removeEvent: (source, target, event) => {
        source.removeAllListeners(event);
        target.removeAllListeners(event);
    },

    registerEvents: (source, target, events) => {
        for (const event of DatabaseUtil.getEventValues(events)) {
            if (event !== "promiseError") {
                DatabaseUtil.registerEvent(source, target, event);
            }
        }
    },

    removeEvents: (source, target, events) => {
        for (const event of DatabaseUtil.getEventValues(events)) {
            DatabaseUtil.removeEvent(source, target, event);
        }
    },

    registerPrefixedEvents: (source, target, prefix, events) => {
        for (const event of DatabaseUtil.getEventValues(events)) {
            const name = `${prefix}_${event}`;
            DatabaseUtil.registerEvent(source, target, name);
        }
    },

    removePrefixedEvents: (source, target, prefix, events) => {
        for (const event of DatabaseUtil.getEventValues(events)) {
            const name = `${prefix}_${event}`;
            DatabaseUtil.removeEvent(source, target, name);
        }
    },

    wrapError(err) {
        return err instanceof DatabaseError ? err : new DatabaseError(err);
    },

    checkSync(target, eventName, throwErrors, res) {
        if (typeof res === "boolean") {
            return res;
        }

        target.emit(eventName, res);

        if (throwErrors) {
            throw res;
        }

        return false;
    },

    checkAsync(target, eventName, throwErrors, resolve, reject, res, resolveValue) {
        if (typeof res === "boolean") {
            return res;
        }

        target.emit(eventName, res);

        if (throwErrors) {
            reject(res);
        } else {
            resolve(resolveValue);
        }

        return false;
    },

    // eslint-disable-next-line require-await
    async checkPromise(target, eventName, throwErrors, res, resolveValue) {
        if (typeof res === "boolean") {
            return res;
        }

        target.emit(eventName, res);

        if (throwErrors) {
            throw res;
        }

        return resolveValue;
    },

    throwSync(target, eventName, throwErrors, err) {
        if (!err) {
            return false;
        }

        err = DatabaseUtil.wrapError(err);
        target.emit(eventName, err);

        if (throwErrors) {
            throw err;
        }

        return false;
    },

    throwAsync(target, eventName, throwErrors, resolve, reject, err, resolveValue) {
        if (!err) {
            return false;
        }

        err = DatabaseUtil.wrapError(err);
        target.emit(eventName, err);

        if (throwErrors) {
            reject(err);
        } else {
            resolve(resolveValue);
        }

        return true;
    },

    // eslint-disable-next-line require-await
    async throwPromise(target, eventName, throwErrors, err, resolveValue) {
        if (!err) {
            return false;
        }

        err = DatabaseUtil.wrapError(err);
        target.emit(eventName, err);

        if (throwErrors) {
            throw err;
        }

        return resolveValue;
    },

    settleSyncError(target, resolve, reject, err, resolveValue) {
        try {
            target._throwErrorSync(err);
            resolve(resolveValue);
        } catch (thrown) {
            reject(thrown);
        }
    },

    sanitize(value, type = "string") {
        try {
            return sqlite.sanitize(value, type);
        } catch (err) {
            throw DatabaseUtil.wrapError(err);
        }
    },

    quoteIdentifier(name, label = "Identifier") {
        if (typeof name !== "string" || name.length === 0) {
            throw new DatabaseError(`${label} must be a non-empty string`);
        }

        return DatabaseUtil.sanitize(name, "identifier");
    },

    getEventId() {
        return crypto.randomBytes(4).toString("hex");
    }
});

export default DatabaseUtil;
