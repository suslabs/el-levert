import mysql from "mysql";

class MysqlConnection {
    constructor(config = null, connection) {
        if (config === null) {
            this.con = connection;
            this.config = connection.config;
            this.throwErrors = this.config.throwErrors;
        } else {
            this.config = config;
            this.connection = mysql.createConnection(config);

            if (typeof config.throwErrors === "boolean") {
                this.throwErrors = onfig.throwErrors;
            } else {
                this.throwErrors = true;
            }
        }
    }

    createQuery(...args) {
        return new Promise((resolve, reject) => {
            let query;

            const callback = err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(query);
            };

            args.push(callback);
            query = this.con.createQuery.apply(this.pool, args);
        });
    }

    connect(options) {
        return new Promise((resolve, reject) => {
            this.con.connect(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    changeUser(options) {
        return new Promise((resolve, reject) => {
            this.con.changeUser(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    beginTransaction(options) {
        return new Promise((resolve, reject) => {
            this.con.beginTransaction(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    commit(options) {
        return new Promise((resolve, reject) => {
            this.con.commit(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    rollback(options) {
        return new Promise((resolve, reject) => {
            this.con.rollback(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    query(...args) {
        return new Promise((resolve, reject) => {
            this.con.query(...args, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    ping(options) {
        return new Promise((resolve, reject) => {
            this.con.ping(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    statistics(options) {
        return new Promise((resolve, reject) => {
            this.con.statistics(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    end(options) {
        return new Promise((resolve, reject) => {
            this.con.end(options, err => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve();
            });
        });
    }

    destroy() {
        return this.con.destroy();
    }

    pause() {
        return this.con.pause();
    }

    resume() {
        return this.con.resume();
    }

    escape(value) {
        return this.con.escape(value);
    }

    escapeId(value) {
        return this.con.escapeId(value);
    }

    format(sql, values) {
        return this.con.format(sql, values);
    }
}

export default MysqlConnection;
