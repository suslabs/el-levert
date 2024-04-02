import mysql from "mysql";
import EventEmitter from "events";

import DatabaseError from "../../errors/DatabaseError.js";

import PoolEvents from "./PoolEvents.js";
import MysqlConnection from "./MysqlConnection.js";

class MysqlPool extends EventEmitter {
    constructor(config) {
        this.config = config;
        this.pool = mysql.createPool(config);

        if (typeof config.throwErrors === "boolean") {
            this.throwErrors = onfig.throwErrors;
        } else {
            this.throwErrors = true;
        }

        this.registerEvents();
    }

    registerEvent(event) {
        this.pool.on(event, ...args => this.emit(event, ...args));
    }

    registerEvents() {
        for (const event of Object.values(PoolEvents)) {
            this.registerEvent(event);
        }
    }

    getConnection() {
        return new Promise((resolve, reject) => {
            this.pool.getConnection((err, connection) => {
                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new MysqlConnection(null, connection));
            });
        });
    }

    acquireConnection(connection) {
        return new Promise((resolve, reject) => {
            try {
                this.pool.acquireConnection(connection.con, (err, connection) => {
                    if (err) {
                        if (this.throwErrors) {
                            reject(new DatabaseError(err));
                        } else {
                            resolve();
                        }
                    }

                    resolve(new MysqlConnection(null, connection));
                });
            } catch (err) {
                if (this.throwErrors) {
                    reject(new DatabaseError(err));
                } else {
                    resolve();
                }
            }
        });
    }

    releaseConnection(connection) {
        return new Promise((resolve, reject) => {
            try {
                this.pool.releaseConnection(connection.con, (err, connection) => {
                    if (err) {
                        if (this.throwErrors) {
                            reject(new DatabaseError(err));
                        } else {
                            resolve();
                        }
                    }

                    resolve();
                });
            } catch (err) {
                if (this.throwErrors) {
                    reject(new DatabaseError(err));
                } else {
                    resolve();
                }
            }
        });
    }

    end() {
        return new Promise((resolve, reject) => {
            this.pool.end(err => {
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
            query = this.pool.query.apply(this.pool, args);
        });
    }

    escape(value) {
        return this.pool.escape(value);
    }

    escapeId(value) {
        return this.pool.escapeId(value);
    }
}

export default MysqlPool;
