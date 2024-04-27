import mysql from "mysql";
import EventEmitter from "node:events";

import DatabaseError from "../../../errors/DatabaseError.js";
import MysqlResult from "./MysqlResult.js";

import PoolEvents from "./PoolEvents.js";
import MysqlPoolConnection from "./MysqlPoolConnection.js";

import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

class MysqlPool extends EventEmitter {
    constructor(config) {
        super();
        this.create(config);
    }

    create(config) {
        if (typeof this.pool !== "undefined") {
            throw new DatabaseError("Cannot create pool. The pool has already been created");
        }

        if (typeof config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.config = config;
        this.throwErrors = config.throwErrors ?? true;

        const pool = mysql.createPool(config);

        this.pool = pool;
        DatabaseUtil.registerEvents(pool, this, PoolEvents);
    }

    end() {
        return new Promise((resolve, reject) => {
            if (typeof this.pool === "undefined") {
                reject(new DatabaseError("Cannot end pool. The pool hasn't been created"));
            }

            this.pool.end(err => {
                if (err) {
                    this.emit(PoolEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }

                    return;
                }

                DatabaseUtil.removeEvents(this.pool, this, PoolEvents);
                delete this.pool;

                resolve();
            });
        });
    }

    getConnection() {
        return new Promise((resolve, reject) => {
            if (typeof this.pool === "undefined") {
                reject(new DatabaseError("The pool hasn't been created"));
            }

            this.pool.getConnection((err, connection) => {
                if (err) {
                    this.emit(PoolEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new MysqlPoolConnection(this, connection));
            });
        });
    }

    acquireConnection(connection) {
        return new Promise((resolve, reject) => {
            if (typeof this.pool === "undefined") {
                reject(new DatabaseError("The pool hasn't been created"));
            }

            try {
                this.pool.acquireConnection(connection.con, (err, connection) => {
                    if (err) {
                        this.emit(PoolEvents.promiseError, err);

                        if (this.throwErrors) {
                            reject(new DatabaseError(err));
                        } else {
                            resolve();
                        }
                    }

                    resolve(new MysqlPoolConnection(this, connection));
                });
            } catch (err) {
                this.emit(PoolEvents.promiseError, err);

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
            if (typeof this.pool === "undefined") {
                reject(new DatabaseError("The pool hasn't been created"));
            }

            try {
                this.pool.releaseConnection(connection.con, err => {
                    if (err) {
                        this.emit(PoolEvents.promiseError, err);

                        if (this.throwErrors) {
                            reject(new DatabaseError(err));
                        } else {
                            resolve();
                        }
                    }

                    resolve();
                });
            } catch (err) {
                this.emit(PoolEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(new DatabaseError(err));
                } else {
                    resolve();
                }
            }
        });
    }

    async query(...args) {
        if (typeof this.pool === "undefined") {
            throw new DatabaseError("The pool hasn't been created");
        }

        const con = await this.getConnection();

        return new Promise((resolve, reject) => {
            const callback = (err, res) => {
                con.release();

                if (err) {
                    this.emit(PoolEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new MysqlResult(res));
            };

            args.push(callback);
            con.query(...args);
        });
    }
}

export default MysqlPool;
