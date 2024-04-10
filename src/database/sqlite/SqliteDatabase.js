import sqlite from "sqlite3";
import EventEmitter from "events";

import DatabaseEvents from "./DatabaseEvents.js";
import OpenModes from "./OpenModes.js";

import DatabaseError from "../../errors/DatabaseError.js";
import SqliteStatement from "./SqliteStatement.js";

import DatabaseUtil from "../../util/DatabaseUtil.js";

class SqliteDatabase extends EventEmitter {
    constructor(filename, mode, config = {}) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        this.config = config;
        this.throwErrors = config.throwErrors ?? true;

        this.inTransaction = false;
        DatabaseUtil.registerEvents(this.db, this, DatabaseEvents);
    }

    open() {
        return new Promise((resolve, reject) => {
            if (typeof this.db !== "undefined") {
                reject(new DatabaseError("Cannot open database. The database is already open"));
            }

            const db = new sqlite.Database(this.filename, this.mode, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                this.db = db;
                resolve(this);
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.close(err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                delete this.db;
                resolve();
            });
        });
    }

    configure(option, value) {
        return this.db.configure(option, value);
    }

    run(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.run(sql, ...param, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    get(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.get(sql, ...param, (err, row) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(row);
            });
        });
    }

    all(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.all(sql, ...param, (err, rows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(rows);
            });
        });
    }

    each(sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.each(sql, param, callback, (err, nrows) => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(nrows);
            });
        });
    }

    exec(sql) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.exec(sql, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    prepare(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            let statement;

            let callback = err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(new SqliteStatement(statement));
            };

            statement = this.db.prepare.apply(this.db, sql, ...param, callback);
        });
    }

    loadExtension(path) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.loadExtension(path, err => {
                if (err) {
                    reject(new DatabaseError(err));
                }

                resolve(this);
            });
        });
    }

    interrupt() {
        this.db.interrupt();
    }

    async beginTransaction() {}

    async transaction(op) {
        await this.exec("BEGIN TRANSACTION");

        try {
            const result = await op(this);

            await this.exec("END TRANSACTION");
            return result;
        } catch (err) {
            await this.exec("ROLLBACK TRANSACTION");
            throw err;
        }
    }
}

export default SqliteDatabase;
