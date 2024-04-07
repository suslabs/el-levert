import mysql from "mysql";

class MysqlConnection {
    constructor(config = null, connection) {
        if (config === null) {
            this.con = connection;
            this.config = connection.config;

            this.throwErrors = this.config.throwErrors;
        } else {
            this.con = mysql.createConnection(config);
            this.config = config;

            if (typeof config.throwErrors === "boolean") {
                this.throwErrors = onfig.throwErrors;
            } else {
                this.throwErrors = true;
            }
        }

        this.inTransaction = false;
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

                this.inTransaction = true;
                resolve();
            });
        });
    }

    commit(options) {
        return new Promise((resolve, reject) => {
            this.con.commit(options, err => {
                this.inTransaction = false;

                if (err) {
                    if (this.inTransaction) {
                        this.con.rollback(() => {
                            if (this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (this.throwErrors) {
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
                this.inTransaction = false;

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
            this.con.query(...args, (err, result) => {
                if (err) {
                    if (this.inTransaction) {
                        this.con.rollback(() => {
                            this.inTransaction = false;

                            if (this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(result);
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
