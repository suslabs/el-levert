import mysql from "mysql";
import EventEmitter from "events";

import ConnectionEvents from "./ConnectionEvents.js";
import DatabaseUtil from "../../util/DatabaseUtil.js";

class MysqlConnection extends EventEmitter {
    constructor(config, connection) {
        super();

        if (typeof connection !== "undefined") {
            this.con = connection;
            this.config = connection.config;

            this.throwErrors = connection.config.throwErrors ?? true;
        } else if (typeof config === "undefined") {
            throw new DatabaseError("No config provided");
        } else {
            this.con = mysql.createConnection(config);
            this.config = config;

            this.throwErrors = config.throwErrors ?? true;
        }

        this.inTransaction = false;
        DatabaseUtil.registerEvents(this.con, this, ConnectionEvents);
    }

    connect(options) {
        return new Promise((resolve, reject) => {
            this.con.connect(options, err => {
                if (err) {
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }

                    return;
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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
                    this.emit(ConnectionEvents.promiseError, err);

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
}

export default MysqlConnection;
