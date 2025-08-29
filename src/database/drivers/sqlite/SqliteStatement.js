import SqliteResult from "./SqliteResult.js";

import DatabaseEvents from "./DatabaseEvents.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteStatement {
    constructor(db, st) {
        this._db = db;
        this._st = st;

        this.finalized = false;
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

            this._st.finalize(err => {
                this.finalized = true;

                if (removeEntry) {
                    this._db.removeStatement(this);
                }

                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                resolve();
            });
        });
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            this._st.bind(...param, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                resolve();
            });
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.reset(_ => {
                resolve();
            });
        });
    }

    run(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.run(...param, err => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(new SqliteResult(undefined, this._st));
            });
        });
    }

    get(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.get(...param, (err, row) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(new SqliteResult(row, this._st));
            });
        });
    }

    all(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.all(...param, (err, rows) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(new SqliteResult(rows, this._st));
            });
        });
    }

    each(...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.each(...param, (err, nrows) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(new SqliteResult(nrows, this._st));
            });
        });
    }

    static _stFinalizedMsg = "The statement is finalized";
    static _stNotFinalizedMsg = "The statement is not finalized";

    _checkFinalized(expected = false, msg) {
        if (this.finalized === expected) {
            return true;
        }

        const defaultMsg = expected ? SqliteStatement._stNotFinalizedMsg : SqliteStatement._stFinalizedMsg;
        return new DatabaseError(msg ?? defaultMsg);
    }

    _checkFinalizedSync(expected, msg) {
        const res = this._checkFinalized(expected, msg);

        if (typeof res === "boolean") {
            return res;
        }

        this._db.emit(DatabaseEvents.promiseError, res);

        if (this.throwErrors) {
            throw res;
        } else {
            return false;
        }
    }

    _checkFinalizedAsync(resolve, reject, expected, msg) {
        const res = this._checkFinalized(expected, msg);

        if (typeof res === "boolean") {
            return res;
        }

        this._db.emit(DatabaseEvents.promiseError, res);

        if (this.throwErrors) {
            reject(res);
        } else {
            resolve();
        }

        return false;
    }

    _throwErrorAsync(...args) {
        return this._db._throwErrorAsync(...args);
    }

    _errorRollbackAsync(...args) {
        return this._db._errorRollbackAsync(...args);
    }
}

export default SqliteStatement;
