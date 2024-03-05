class AsyncStatement {
    constructor(statement) {
        this.st = statement;
    }

    get lastID() {
        return this.st.lastID;
    }

    get changes() {
        return this.st.changes;
    }

    bind(...args) {
        return new Promise((resolve, reject) => {
            this.st.bind(...args, err => {
                if (err) {
                    reject(err);
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

    run(...args) {
        return new Promise((resolve, reject) => {
            this.st.run(...args, err => {
                if (err) {
                    reject(err);
                }

                resolve(this);
            });
        });
    }

    get(...args) {
        return new Promise((resolve, reject) => {
            this.st.get(...args, (err, row) => {
                if (err) {
                    reject(err);
                }

                resolve(row);
            });
        });
    }

    all(...args) {
        return new Promise((resolve, reject) => {
            this.st.all(...args, (err, rows) => {
                if (err) {
                    reject(err);
                }

                resolve(rows);
            });
        });
    }

    each(...args) {
        return new Promise((resolve, reject) => {
            this.st.each(...args, (err, nrows) => {
                if (err) {
                    reject(err);
                }

                resolve(nrows);
            });
        });
    }

    finalize() {
        return new Promise((resolve, reject) => {
            this.st.finalize(err => {
                if (err) {
                    reject(err);
                }

                resolve(this);
            });
        });
    }
}

export default AsyncStatement;
