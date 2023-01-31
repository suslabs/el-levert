import sqlite from "sqlite3";

import DatabaseError from "../errors/DatabaseError.js";
import AsyncStatement from "./AsyncStatement.js";

const Modes = {
    OPEN_READONLY: sqlite.OPEN_READONLY,
    OPEN_READWRITE: sqlite.OPEN_READWRITE,
    OPEN_CREATE: sqlite.OPEN_CREATE,
    OPEN_RWCREATE: sqlite.OPEN_READWRITE | sqlite.OPEN_CREATE
};

class AsyncDatabase {
    constructor(filename, mode) {
        this.filename = filename;

        if (typeof mode === "undefined") {
            mode = Modes.OPEN_RWCREATE;
        }

        this.mode = mode;
    }

    open() {
        return new Promise((resolve, reject) => {
            if(typeof this.db !== "undefined") {
                reject(new DatabaseError("Cannot open database. Database is already open."));
            }

            const db = new sqlite.Database(this.filename, this.mode, (err) => {
                if(err) {
                    reject(err);
                }

                this.db = db;
                resolve(this);
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            this.db.close(err => {
                if(err) {
                    reject(err);
                }

                delete this.db;
                resolve();
            });
        });
    }

    configure(option, value) {
        return this.db.configure(option, value);
    }

    run(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            const cb = function (err) {
                if(err) {
                    reject(err);
                }

                resolve(this);
            }

            this.db.run(...args, cb);
        });
    }

    get(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            this.db.get(...args, (err, row) => {
                if(err) {
                    reject(err);
                }

                resolve(row);
            });
        });
    }

    all(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            this.db.all(...args, (err, rows) => {
                if(err) {
                    reject(err);
                }

                resolve(rows);
            });
        });
    }

    each(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            this.db.each(...args, (err, nrows) => {
                if(err) {
                    reject(err);
                }

                resolve(nrows);
            });
        });
    }

    resolve(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            this.db.resolve(...args, err => {
                if(err) {
                    reject(err);
                }

                resolve(this);
            });
        });
    }

    prepare(...args) {
        return new Promise((resolve, reject) => {
            if(typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open."));
            }

            let statement;

            let callback = (err) => {
                if (err) {
                    reject(err);
                }

                resolve(new AsyncStatement(statement));
            };

            args.push(callback);
            statement = this.db.prepare.apply(this.db, args);
        });
    }

    async transaction(op) {
        await this.exec("BEGIN TRANSACTION");

        try {
            const result = await op(this);

            await this.exec('END TRANSACTION');
            return result;
        } catch (err) {
            await this.exec("ROLLBACK TRANSACTION");
            throw err;
        }
    }
}

export { AsyncDatabase, Modes };