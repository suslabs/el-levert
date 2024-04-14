import SqliteResult from "./SqliteResult.js";
import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteStatement {
    constructor(db, st) {
        this.db = db;
        this.st = st;

        this.finalized = false;
    }

    finalize(removeEntry = true) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("Cannot finalize statement. The statement is already finalized"));
            }

            this.st.finalize(err => {
                this.finalized = true;

                if (removeEntry) {
                    this.db.removeStatement(this);
                }

                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve();
            });
        });
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.bind(...param, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve();
            });
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.reset(_ => {
                resolve();
            });
        });
    }

    run(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.run(...param, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(new SqliteResult(undefined, this.st));
            });
        });
    }

    get(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.get(...param, (err, row) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(new SqliteResult(row, this.st));
            });
        });
    }

    all(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.all(...param, (err, rows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(new SqliteResult(rows, this.st));
            });
        });
    }

    each(...param) {
        return new Promise((resolve, reject) => {
            if (this.finalized) {
                reject(new DatabaseError("The statement is finalized"));
            }

            this.st.each(...param, (err, nrows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(new SqliteResult(nrows, this.st));
            });
        });
    }
}

export default SqliteStatement;
