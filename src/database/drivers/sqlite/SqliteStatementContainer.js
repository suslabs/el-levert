import { DatabaseEvents } from "./DatabaseEvents.js";

import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteStatementContainer {
    static _stFinalizedMsg = "The statement is finalized";
    static _stNotFinalizedMsg = "The statement is not finalized";

    constructor(db, sql, defaultParam = []) {
        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalized = false;
        this._safeIntegers = null;

        this._db = db;
        this._statements = new Map();
    }

    async bind(...param) {
        if (
            !(await this._checkFinalizedPromise(
                false,
                `Cannot bind statement. ${SqliteStatementContainer._stFinalizedMsg}`
            ))
        ) {
            return;
        }

        this.defaultParam = param;

        for (const st of this._getStatements()) {
            await st.bind(...param);
        }
    }

    safeIntegers(enabled = true) {
        if (!this._checkFinalizedSync()) {
            return;
        }

        this._safeIntegers = enabled;

        for (const st of this._getStatements()) {
            st.safeIntegers(enabled);
        }

        return this;
    }

    async finalize(removeEntry = true) {
        if (
            !(await this._checkFinalizedPromise(
                false,
                `Cannot finalize statement. ${SqliteStatementContainer._stFinalizedMsg}`
            ))
        ) {
            return;
        }

        for (const st of this._getStatements()) {
            await st.finalize();
        }

        this.finalized = true;
        this._statements.clear();

        if (removeEntry) {
            this._db.removeStatement(this);
        }
    }

    async reset() {
        if (!(await this._checkFinalizedPromise())) {
            return;
        }

        for (const st of this._getStatements()) {
            await st.reset();
        }
    }

    async run(...param) {
        return await this._useStatement(st => st.run(...param));
    }

    async get(...param) {
        return await this._useStatement(st => st.get(...param));
    }

    async all(...param) {
        return await this._useStatement(st => st.all(...param));
    }

    async each(...param) {
        return await this._useStatement(st => st.each(...param));
    }

    async bindToConnection(conn) {
        if (!(await this._checkFinalizedPromise())) {
            return;
        }

        const existing = this._statements.get(conn);

        if (typeof existing !== "undefined" && !existing.finalized) {
            return existing;
        }

        const st = await conn.prepareTemplate(this.sql, this.defaultParam, this);

        if (this._safeIntegers !== null) {
            st.safeIntegers(this._safeIntegers);
        }

        this._statements.set(conn, st);
        return st;
    }

    _removeStatement(conn, st) {
        if (this._statements.get(conn) === st) {
            this._statements.delete(conn);
        }
    }

    _checkFinalized(expected = false, msg) {
        if (this.finalized === expected) {
            return true;
        }

        const defaultMsg = expected
            ? SqliteStatementContainer._stNotFinalizedMsg
            : SqliteStatementContainer._stFinalizedMsg;
        return new DatabaseError(msg ?? defaultMsg);
    }

    _checkFinalizedSync(expected, msg) {
        return DatabaseUtil.checkSync(
            this._db,
            DatabaseEvents.promiseError,
            this._db.throwErrors,
            this._checkFinalized(expected, msg)
        );
    }

    async _checkFinalizedPromise(expected, msg) {
        return await DatabaseUtil.checkPromise(
            this._db,
            DatabaseEvents.promiseError,
            this._db.throwErrors,
            this._checkFinalized(expected, msg)
        );
    }

    _getStatements() {
        const sts = [];

        for (const [conn, st] of this._statements) {
            if (st.finalized || conn.db === null) {
                this._statements.delete(conn);
                continue;
            }

            sts.push(st);
        }

        return sts;
    }

    async _useStatement(callback) {
        return await this._db._useStatementContainer(this, callback);
    }
}

export default SqliteStatementContainer;
