import mysql from "mysql";
import EventEmitter from "events";

import DatabaseError from "../../errors/DatabaseError.js";

import PoolEvents from "./PoolEvents.js";
import MysqlPoolConnection from "./MysqlPoolConnection.js";

import DatabaseUtil from "../../util/DatabaseUtil.js";

class MysqlPool extends EventEmitter {
    constructor(config) {
        super();

        if (typeof config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.config = config;
        this.throwErrors = config.throwErrors ?? true;

        this.pool = mysql.createPool(config);

        DatabaseUtil.registerEvents(this.pool, this, PoolEvents);
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
                } else {
                    resolve(new MysqlPoolConnection(connection));
                }
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
                    } else {
                        resolve(new MysqlPoolConnection(connection));
                    }
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
                this.pool.releaseConnection(connection.con, err => {
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

    async query(...args) {
        const con = await this.getConnection();

        return new Promise((resolve, reject) => {
            const callback = (err, result) => {
                con.release();

                if (err) {
                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(result);
            };

            args.push(callback);
            con.query(...args);
        });
    }
}

export default MysqlPool;
