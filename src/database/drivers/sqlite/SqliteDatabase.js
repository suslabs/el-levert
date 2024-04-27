import sqlite from "sqlite3";
import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import DatabaseEvents from "./DatabaseEvents.js";
import OpenModes from "./OpenModes.js";

import SqliteStatement from "./SqliteStatement.js";
import SqliteResult from "./SqliteResult.js";

import DatabaseError from "../../../errors/DatabaseError.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

const transactionSql = {
    begin: "BEGIN TRANSACTION",
    commit: "END TRANSACTION",
    rollback: "ROLLBACK TRANSACTION"
};

class SqliteDatabase extends StatementDatabase(EventEmitter) {
    constructor(filename, mode, config = {}) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        this.config = config;
        this.throwErrors = config.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? false;

        this.inTransaction = false;
    }

    open() {
        return new Promise((resolve, reject) => {
            if (typeof this.db !== "undefined") {
                reject(new DatabaseError("Cannot open database. The database is already open"));
            }

            const db = new sqlite.Database(this.filename, this.mode, err => {
                if (err) {
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }

                    return;
                }

                this.initDatabase(db);
                resolve();
            });
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("Cannot close database. The database is not open"));
            }

            this.finalizeAll()
                .then(_ => {
                    this.db.close(err => {
                        if (err) {
                            this.emit(DatabaseEvents.promiseError, err);

                            if (this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }

                            return;
                        }

                        this.deleteDatabase();
                        resolve();
                    });
                })
                .catch();
        });
    }

    configure(option, value) {
        if (typeof this.db === "undefined") {
            throw new DatabaseError("The database is not open");
        }

        return this.db.configure(option, value);
    }

    run(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            const _this = this;
            this.db.run(sql, ...param, function (err) {
                const st = this;

                if (err) {
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this.rollback().then(_ => {
                            if (_this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (_this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new SqliteResult(undefined, st));
            });
        });
    }

    get(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            const _this = this;
            this.db.get(sql, ...param, function (err, row) {
                const st = this;

                if (err) {
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this.rollback().then(_ => {
                            if (_this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (_this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new SqliteResult(row, st));
            });
        });
    }

    all(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            const _this = this;
            this.db.all(sql, ...param, (err, rows) => {
                const st = this;

                if (err) {
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this.rollback().then(_ => {
                            if (_this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (_this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new SqliteResult(rows, st));
            });
        });
    }

    each(sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            const _this = this;
            this.db.each(sql, param, callback, function (err, nrows) {
                const st = this;

                if (err) {
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this.rollback().then(_ => {
                            if (_this.throwErrors) {
                                reject(new DatabaseError(err));
                            } else {
                                resolve();
                            }
                        });
                    } else if (_this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                resolve(new SqliteResult(nrows, st));
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
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    }
                }

                resolve();
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
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve();
                    }
                }

                const newSt = new SqliteStatement(this, statement);
                this.addStatement(newSt);

                resolve(newSt);
            };

            statement = this.db.prepare(sql, ...param, callback);
        });
    }

    async beginTransaction() {
        if (this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        try {
            await this.exec(transactionSql.begin);
            this.inTransaction = true;
        } catch (err) {
            if (original) {
                throw err;
            }
        } finally {
            this.throwErrors = original;
        }
    }

    async commit() {
        if (!this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        try {
            await this.exec(transactionSql.commit);
            this.inTransaction = false;

            this.throwErrors = original;
        } catch (err) {
            this.throwErrors = original;
            await this.exec(transactionSql.rollback);

            if (this.throwErrors) {
                throw err;
            }
        }
    }

    async rollback() {
        if (!this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        try {
            await this.exec(transactionSql.rollback);
            this.inTransaction = false;
        } catch (err) {
            if (original) {
                throw err;
            }
        } finally {
            this.throwErrors = original;
        }
    }

    loadExtension(path) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                reject(new DatabaseError("The database is not open"));
            }

            this.db.loadExtension(path, err => {
                if (err) {
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(new DatabaseError(err));
                    } else {
                        resolve(this);
                    }
                }

                resolve(this);
            });
        });
    }

    interrupt() {
        this.db.interrupt();
    }

    initDatabase(db) {
        this.db = db;
        DatabaseUtil.registerEvents(this.db, this, DatabaseEvents);
    }

    deleteDatabase() {
        this.db.configure = _ => {};
        DatabaseUtil.removeEvents(this.db, this, DatabaseEvents);

        delete this.db;
    }
}

export default SqliteDatabase;
