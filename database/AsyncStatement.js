class AsyncStatement {
    constructor(statement) {
        this.st = statement;
    }

    bind(...args) {
        return new Promise((resolve, reject) => {
            this.st.bind(...args, err => {
                if(err) {
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
            const cb = function (err) {
                if(err) {
                    reject(err);
                }

                resolve(this);
            }

            this.st.run(...args, cb);
        });
    }

    get(...args) {
        return new Promise((resolve, reject) => {
            this.st.get(...args, (err, row) => {
                if(err) {
                    reject(err);
                }

                resolve(row);
            });
        });
    }

    all(...args) {
        return new Promise((resolve, reject) => {
            this.st.all(...args, (err, rows) => {
                if(err) {
                    reject(err);
                }

                resolve(rows);
            });
        });
    }

    each(...args) {
        return new Promise((resolve, reject) => {
            this.st.each(...args, (err, nrows) => {
                if(err) {
                    reject(err);
                }

                resolve(nrows);
            });
        });
    }
}

export default AsyncStatement;