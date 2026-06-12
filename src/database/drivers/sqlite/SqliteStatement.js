import SqliteResult from "./SqliteResult.js";

import { ConnectionStatementBackend, PooledStatementBackend } from "./StatementBackends.js";

import { ConnectionEvents } from "./ConnectionEvents.js";

import Util from "../../../util/Util.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";
import { nil } from "ajv";

class SqliteStatement {
    constructor(target, sql, defaultParam = [], rawSt = null) {
        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalized = false;
        this._safeIntegers = null;

        this._backend = null;
        this._owner = null;

        if (rawSt === null) {
            this._backend = new PooledStatementBackend(target);
        } else {
            this._backend = new ConnectionStatementBackend(target, rawSt);
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

            this._backend.finalize(this, resolve, reject, removeEntry);
        });
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this.defaultParam = param;
            this._backend.bind(this, param, resolve, reject);
        });
    }

    safeIntegers(enabled = true) {
        if (!this._checkFinalizedSync()) {
            return;
        }

        this._safeIntegers = enabled;

        try {
            this._backend.safeIntegers(this, enabled);
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    setOwner(owner = null) {
        this._owner = owner;
    }

    reset() {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._backend.reset(this, resolve, reject);
        });
    }

    run(...param) {
        return this._executeStatement("run", param, (_err, st) => new SqliteResult(undefined, st));
    }

    get(...param) {
        return this._executeStatement("get", param, (row, st) => new SqliteResult(row, st));
    }

    all(...param) {
        return this._executeStatement("all", param, (rows, st) => new SqliteResult(rows, st));
    }

    each(...param) {
        return this._useContext((context, resolve, reject) => {
            let eachArgs,
                args = [];

            try {
                eachArgs = context.conn._extractEachArgs(param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            const normalized = this._normalizeArgs(context.conn, eachArgs.param, true);

            if (normalized !== null) {
                args.push(normalized);
            }

            args.push(eachArgs.callback);
            args.push((err, nrows) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                context.st.reset(err2 => {
                    if (this._throwErrorAsync(resolve, reject, err2)) {
                        return;
                    }

                    resolve(new SqliteResult(nrows, context.st));
                });
            });

            try {
                context.st.each(...args);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    static _stFinalizedMsg = "The statement is finalized";
    static _stNotFinalizedMsg = "The statement is not finalized";

    get _conn() {
        return this._backend.getConnection();
    }

    get _throwErrors() {
        return this._owner === null ? this._backend.getTarget().throwErrors : this._owner.throwErrors;
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
            this._backend.getTarget(),
            ConnectionEvents.promiseError,
            this._throwErrors,
            this._checkFinalized(expected, msg)
        );
    }

    _checkFinalizedAsync(resolve, reject, expected, msg) {
        return DatabaseUtil.checkAsync(
            this._backend.getTarget(),
            ConnectionEvents.promiseError,
            this._throwErrors,
            resolve,
            reject,
            this._checkFinalized(expected, msg)
        );
    }

    _useContext(callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._backend
                .getContext(this)
                .then(context => {
                    if (context === null || context.st === null) {
                        resolve();
                        return;
                    }

                    const settle = (fn, value) =>
                        this._backend
                            .releaseContext(context)
                            .then(_ => fn(value))
                            .catch(reject);

                    callback(
                        context,
                        value => settle(resolve, value),
                        err => settle(reject, err)
                    );
                })
                .catch(reject);
        });
    }

    _normalizeArgs(conn, args, eachMode = false) {
        if (Util.empty(args)) {
            args = this.defaultParam;
        }

        if (Util.empty(args) && eachMode) {
            return null;
        }

        return args.map(arg => conn._normalizeParam(arg));
    }

    _executeStatement(method, param, callback) {
        return this._useContext((context, resolve, reject) => {
            let args;

            try {
                args = this._normalizeArgs(context.conn, param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            try {
                context.st[method](...args, (err, data) => {
                    if (this._errorRollbackAsync(resolve, reject, err)) {
                        return;
                    }

                    context.st.reset(err2 => {
                        if (this._throwErrorAsync(resolve, reject, err2)) {
                            return;
                        }

                        resolve(callback(data, context.st));
                    });
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    _removeOwner(removeEntry) {
        if (removeEntry && this._owner !== null) {
            this._owner.removeStatement(this);
            this.setOwner();
        }
    }

    _throwErrorSync(...args) {
        return this._backend.getTarget()._throwErrorSync(...args);
    }

    _throwErrorAsync(...args) {
        return this._backend.getTarget()._throwErrorAsync(...args);
    }

    _errorRollbackAsync(...args) {
        const target = this._backend.getTarget();
        return target._errorRollbackAsync?.(...args) ?? target._throwErrorAsync(...args);
    }
}

export default SqliteStatement;
