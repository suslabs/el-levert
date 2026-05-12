import crypto from "node:crypto";

import DatabaseError from "../../errors/DatabaseError.js";

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DatabaseUtil = Object.freeze({
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

    quoteIdentifier(name, label = "Identifier") {
        if (typeof name !== "string" || name.length === 0) {
            throw new DatabaseError(`${label} must be a non-empty string`);
        }

        if (!identifierPattern.test(name)) {
            throw new DatabaseError(`Invalid ${label.toLowerCase()} '${name}'`);
        }

        return `"${name}"`;
    },

    getEventId() {
        return crypto.randomBytes(4).toString("hex");
    }
});

export default DatabaseUtil;
