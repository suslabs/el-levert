import DatabaseError from "../../../errors/DatabaseError.js";
import DatabaseEvents from "./DatabaseEvents.js";

import SqliteResult from "./SqliteResult.js";

class SqliteStatement {
    constructor(db, st) {
        this._db = db;
        this._st = st;

        this.finalized = false;
    }

    finalize(removeEntry = true) {
        return new Promise((resolve, reject) => {
            if (
                this._checkFinalizedAsync(
                    resolve,
                    reject,
                    "Cannot finalize statement. The statement is already finalized"
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
            if (this._checkFinalizedAsync(resolve, reject)) {
                return;
            }

            this._st.reset(_ => {
                resolve();
            });
        });
    }

    run(...param) {
        return new Promise((resolve, reject) => {
            if (this._checkFinalizedAsync(resolve, reject)) {
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
            if (this._checkFinalizedAsync(resolve, reject)) {
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
            if (this._checkFinalizedAsync(resolve, reject)) {
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
            if (this._checkFinalizedAsync(resolve, reject)) {
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

    _checkFinalizedAsync(resolve, reject, msg) {
        if (!this.finalized) {
            return false;
        }

        const err = new DatabaseError(msg ?? "The statement is finalized");
        this._db.emit(DatabaseEvents.promiseError, err);

        if (this._db.throwErrors) {
            reject(err);
        } else {
            resolve();
        }

        return true;
    }

    _throwErrorAsync(resolve, reject, err) {
        return this._db._throwErrorAsync(resolve, reject, err);
    }

    _errorRollbackAsync(resolve, reject, err) {
        return this._db._errorRollbackAsync(resolve, reject, err);
    }
}

export default SqliteStatement;
