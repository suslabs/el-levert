import DatabaseError from "../../errors/DatabaseError.js";

class SqliteStatement {
    constructor(statement) {
        this.st = statement;
    }

    get lastID() {
        return this.st.lastID;
    }

    get changes() {
        return this.st.changes;
    }

    bind(...param) {
        return new Promise((resolve, reject) => {
            this.st.bind(...param, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    reset() {
        return new Promise((resolve, reject) => {
            this.st.reset(_ => {
                resolve(this);
            });
        });
    }

    finalize() {
        return new Promise((resolve, reject) => {
            this.st.finalize(err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    run(...param) {
        return new Promise((resolve, reject) => {
            this.st.run(...param, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    get(...param) {
        return new Promise((resolve, reject) => {
            this.st.get(...param, (err, row) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(row);
            });
        });
    }

    all(...param) {
        return new Promise((resolve, reject) => {
            this.st.all(...param, (err, rows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(rows);
            });
        });
    }

    each(...param) {
        return new Promise((resolve, reject) => {
            this.st.each(...param, (err, nrows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(nrows);
            });
        });
    }
}

export default SqliteStatement;
