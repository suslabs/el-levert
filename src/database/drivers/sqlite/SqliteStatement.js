import SqliteResult from "./SqliteResult.js";

import { ConnectionStatementBackend, PooledStatementBackend } from "./StatementBackends.js";

import ConnectionEvents from "./ConnectionEvents.js";

import Util from "../../../util/Util.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteStatement {
    constructor(target, sql, defaultParam = [], rawStatement = null) {
        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalized = false;

        this._backend = null;

        if (rawStatement == null) {
            this._backend = new PooledStatementBackend(target);
        } else {
            this._backend = new ConnectionStatementBackend(target, rawStatement);
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
            } catch (err1) {
                this._throwErrorAsync(resolve, reject, err1);
                return;
            }

            const normalized = this._normalizeArgs(context.conn, eachArgs.param, true);

            if (normalized !== null) {
                args.push(normalized);
            }

            args.push(eachArgs.callback);
            args.push((err1, nrows) => {
                if (this._errorRollbackAsync(resolve, reject, err1)) {
                    return;
                }

                context.st.reset(_ => {
                    resolve(new SqliteResult(nrows, context.st));
                });
            });

            context.st.each(...args);
        });
    }

    static _stFinalizedMsg = "The statement is finalized";
    static _stNotFinalizedMsg = "The statement is not finalized";

    get _conn() {
        return this._backend.getConnection();
    }

    get _throwErrors() {
        return this._owner?.throwErrors ?? this._backend.getTarget().throwErrors;
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
                    const settle = (fn, value) => {
                        this._backend
                            .releaseContext(context)
                            .then(_ => {
                                fn(value);
                            })
                            .catch(reject);
                    };

                    callback(
                        context,
                        value => {
                            settle(resolve, value);
                        },
                        err => {
                            settle(reject, err);
                        }
                    );
                })
                .catch(reject)
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
            } catch (err1) {
                this._throwErrorAsync(resolve, reject, err1);
                return;
            }

            context.st[method](...args, (err1, data) => {
                if (this._errorRollbackAsync(resolve, reject, err1)) {
                    return;
                }

                context.st.reset(_ => {
                    resolve(callback(data, context.st));
                });
            });
        });
    }

    _removeOwner(removeEntry) {
        if (removeEntry && this._owner != null) {
            this._owner.removeStatement(this);
        }
    }

    _throwErrorAsync(...args) {
        return this._backend.getTarget()._throwErrorAsync(...args);
    }

    _errorRollbackAsync(...args) {
        return this._backend.getTarget()._errorRollbackAsync(...args);
    }
}

export default SqliteStatement;
