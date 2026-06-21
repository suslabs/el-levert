import SqliteResult from "./SqliteResult.js";

import { ConnectionEvents } from "./ConnectionEvents.js";

import Util from "../../../util/Util.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteStatement {
    static _stFinalizedMsg = "The statement is finalized";
    static _stNotFinalizedMsg = "The statement is not finalized";

    constructor(conn, sql, defaultParam = [], rawSt, options = {}) {
        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalized = false;
        this._safeIntegers = null;

        this._conn = conn;
        this._rawSt = rawSt;
        this._template = options.template ?? null;
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this.defaultParam = param;

            try {
                param = this._normalizeArgs(param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            try {
                this._rawSt.bind(...param, err => {
                    if (this._throwErrorAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve();
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    safeIntegers(enabled = true) {
        if (!this._checkFinalizedSync()) {
            return;
        }

        this._safeIntegers = enabled;

        try {
            this._rawSt.safeIntegers(enabled);
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    finalize(removeEntry = true) {
        return new Promise((resolve, reject) => {
            if (
                !this._checkFinalizedAsync(
                    resolve,
                    reject,
                    false,
                    `Cannot finalize statement. ${SqliteStatement._stFinalizedMsg}`
                )
            ) {
                return;
            }

            try {
                this._rawSt.finalize(err => {
                    this.finalized = true;
                    this._template?._removeStatement(this._conn, this);

                    if (removeEntry) {
                        this._conn.removeStatement(this);
                    }

                    this._rawSt = null;

                    if (this._throwErrorAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve();
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            try {
                this._rawSt.reset(err => {
                    if (this._throwErrorAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve();
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    run(...param) {
        return this._executeStatement("run", param, (_data, st) => new SqliteResult(undefined, st));
    }

    get(...param) {
        return this._executeStatement("get", param, (row, st) => new SqliteResult(row, st));
    }

    all(...param) {
        return this._executeStatement("all", param, (rows, st) => new SqliteResult(rows, st));
    }

    each(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            let eachArgs,
                args = [];

            try {
                eachArgs = this._conn._extractEachArgs(param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            const normalized = this._normalizeArgs(eachArgs.param, true);

            if (normalized !== null) {
                args.push(normalized);
            }

            args.push(eachArgs.callback);
            args.push((err, nrows) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                this._rawSt.reset(err2 => {
                    if (this._throwErrorAsync(resolve, reject, err2)) {
                        return;
                    }

                    resolve(new SqliteResult(nrows, this._rawSt));
                });
            });

            try {
                this._rawSt.each(...args);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    _checkFinalized(expected = false, msg) {
        if (this.finalized === expected) {
            return true;
        }

        const defaultMsg = expected ? SqliteStatement._stNotFinalizedMsg : SqliteStatement._stFinalizedMsg;
        return new DatabaseError(msg ?? defaultMsg);
    }

    _checkFinalizedSync(expected, msg) {
        return DatabaseUtil.checkSync(
            this._conn,
            ConnectionEvents.promiseError,
            this._conn.throwErrors,
            this._checkFinalized(expected, msg)
        );
    }

    _checkFinalizedAsync(resolve, reject, expected, msg) {
        return DatabaseUtil.checkAsync(
            this._conn,
            ConnectionEvents.promiseError,
            this._conn.throwErrors,
            resolve,
            reject,
            this._checkFinalized(expected, msg)
        );
    }

    _normalizeArgs(args, eachMode = false) {
        if (Util.empty(args)) {
            args = this.defaultParam;
        }

        if (Util.empty(args) && eachMode) {
            return null;
        }

        return args.map(arg => this._conn._normalizeParam(arg));
    }

    _executeStatement(method, param, callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            let args;

            try {
                args = this._normalizeArgs(param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            try {
                this._rawSt[method](...args, (err, data) => {
                    if (this._errorRollbackAsync(resolve, reject, err)) {
                        return;
                    }

                    this._rawSt.reset(err2 => {
                        if (this._throwErrorAsync(resolve, reject, err2)) {
                            return;
                        }

                        resolve(callback(data, this._rawSt));
                    });
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    _throwErrorSync(...args) {
        return this._conn._throwErrorSync(...args);
    }

    _throwErrorAsync(...args) {
        return this._conn._throwErrorAsync(...args);
    }

    _errorRollbackAsync(...args) {
        return this._conn._errorRollbackAsync(...args);
    }
}

export default SqliteStatement;
