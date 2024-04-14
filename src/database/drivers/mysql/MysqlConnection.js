import mysql from "mysql";
import EventEmitter from "events";

import ConnectionEvents from "./ConnectionEvents.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";
import DatabaseError from "../../../errors/DatabaseError.js";

class MysqlConnection extends EventEmitter {
    constructor(config, connection) {
        super();

        if (typeof connection !== "undefined") {
            this.createFrom(connection, config);
        } else {
            this.create(config);
        }
    }

    create(config) {
        if (typeof this.con !== "undefined") {
            throw new DatabaseError("Cannot create connection. The connection has already been created");
        }

        if (typeof config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.config = config;
        this.throwErrors = config.throwErrors ?? true;

        const con = mysql.createConnection(config);

        this.con = con;
        this.inTransaction = false;

        DatabaseUtil.registerEvents(con, this, ConnectionEvents);
    }

    createFrom(connection, config) {
        if (typeof this.con !== "undefined") {
            throw new DatabaseError("Cannot create connection. The connection has already been created");
        }

        if (typeof connection === "undefined") {
            throw new DatabaseError("No source connection provided");
        }

        this.config = {
            ...connection.config,
            ...(config ?? {})
        };

        this.throwErrors = this.config.throwErrors ?? true;

        this.con = connection;
        this.inTransaction = false;

        DatabaseUtil.registerEvents(this.con, this, ConnectionEvents);
    }

    end(options) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("Cannot end connection. The connection hasn't been created"));
            }

            this.con.end(options, err => {
                if (err) {
                    this.emit(ConnectionEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }

                    return;
                }

                DatabaseUtil.removeEvents(this.con, this, ConnectionEvents);
                delete this.con;

                resolve();
            });
        });
    }

    connect(options) {
        return new Promise((resolve, reject) => {
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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

    query(...args) {
        return new Promise((resolve, reject) => {
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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

    changeUser(options) {
        return new Promise((resolve, reject) => {
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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
            if (typeof this.con === "undefined") {
                reject(new DatabaseError("The connection hasn't been created"));
            }

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

    destroy() {
        if (typeof this.con === "undefined") {
            throw new DatabaseError("Cannot destroy the connection. The connection hasn't been created");
        }

        DatabaseUtil.removeEvents(this.con, this, ConnectionEvents);
        delete this.con;

        this.con.destroy();
    }

    pause() {
        if (typeof this.con === "undefined") {
            throw new DatabaseError("The connection hasn't been created");
        }

        this.con.pause();
    }

    resume() {
        if (typeof this.con === "undefined") {
            throw new DatabaseError("The connection hasn't been created");
        }

        this.con.resume();
    }
}

export default MysqlConnection;
