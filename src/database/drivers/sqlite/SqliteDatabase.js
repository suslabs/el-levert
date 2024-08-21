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
    begin: "BEGIN TRANSACTION;",
    commit: "END TRANSACTION;",
    rollback: "ROLLBACK TRANSACTION;"
};

const journalModePragma = {
    enableWAL: "journal_mode=WAL",
    disableWAL: "journal_mode=DELETE"
};

class SqliteDatabase extends StatementDatabase(EventEmitter) {
    constructor(filename, mode, config = {}) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        this.config = config;

        this.WALMode = config.enableWALMode ?? false;
        this.throwErrors = config.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? false;

        this.inTransaction = false;
    }

    open() {
        return new Promise((resolve, reject) => {
            if (typeof this.db !== "undefined") {
                const err = new DatabaseError("Cannot open database. The database is already open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            const db = new sqlite.Database(this.filename, this.mode, err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                this.initDatabase(db);
                resolve();
            });
        }).then(_ => {
            if (!this.WALMode) {
                return;
            }

            return this.enableWALMode();
        });
    }

    close() {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("Cannot close database. The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.finalizeAll()
                .then(_ => {
                    this.db.close(err => {
                        if (err) {
                            err = new DatabaseError(err);
                            this.emit(DatabaseEvents.promiseError, err);

                            if (this.throwErrors) {
                                reject(err);
                            } else {
                                resolve();
                            }

                            return;
                        }

                        this.deleteDatabase();
                        resolve();
                    });
                })
                .catch(reject);
        });
    }

    configure(option, value) {
        if (typeof this.db === "undefined") {
            const err = new DatabaseError("The database is not open");
            this.emit(DatabaseEvents.promiseError, err);

            if (this.throwErrors) {
                throw err;
            }

            return;
        }

        try {
            return this.db.configure(option, value);
        } catch (err) {
            err = new DatabaseError(err);
            this.emit(DatabaseEvents.promiseError, err);

            if (this.throwErrors) {
                throw err;
            }
        }
    }

    run(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            const _this = this;
            this.db.run(sql, ...param, function (err) {
                const st = this;

                if (err) {
                    err = new DatabaseError(err);
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this
                            .rollback()
                            .then(_ => {
                                if (_this.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (_this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(undefined, st));
            });
        });
    }

    get(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            const _this = this;
            this.db.get(sql, ...param, function (err, row) {
                const st = this;

                if (err) {
                    err = new DatabaseError(err);
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this
                            .rollback()
                            .then(_ => {
                                if (_this.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (_this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(row, st));
            });
        });
    }

    all(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            const _this = this;
            this.db.all(sql, ...param, (err, rows) => {
                const st = this;

                if (err) {
                    err = new DatabaseError(err);
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this
                            .rollback()
                            .then(_ => {
                                if (_this.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (_this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(rows, st));
            });
        });
    }

    each(sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            const _this = this;
            this.db.each(sql, param, callback, function (err, nrows) {
                const st = this;

                if (err) {
                    err = new DatabaseError(err);
                    _this.emit(DatabaseEvents.promiseError, err);

                    if (_this.autoRollback && _this.inTransaction) {
                        _this
                            .rollback()
                            .then(_ => {
                                if (_this.throwErrors) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            })
                            .catch(reject);
                    } else if (_this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve(new SqliteResult(nrows, st));
            });
        });
    }

    exec(sql) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.db.exec(sql, err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
                }

                resolve();
            });
        });
    }

    prepare(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (typeof this.db === "undefined") {
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            let statement;

            let callback = err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }

                    return;
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
                const err = new DatabaseError("The database is not open");
                this.emit(DatabaseEvents.promiseError, err);

                if (this.throwErrors) {
                    reject(err);
                } else {
                    resolve();
                }

                return;
            }

            this.db.loadExtension(path, err => {
                if (err) {
                    err = new DatabaseError(err);
                    this.emit(DatabaseEvents.promiseError, err);

                    if (this.throwErrors) {
                        reject(err);
                    } else {
                        resolve(this);
                    }

                    return;
                }

                resolve(this);
            });
        });
    }

    async pragma(pragma) {
        const sql = `PRAGMA ${pragma};`;
        await this.exec(pragmaSql);
    }

    async enableWALMode() {
        await this.pragma(journalModePragma.enableWAL);
        this.WALMode = true;
    }

    async disableWALMode() {
        await this.pragma(journalModePragma.disableWAL);
        this.WALMode = false;
    }

    interrupt() {
        try {
            this.db.interrupt();
        } catch (err) {
            err = new DatabaseError(err);
            this.emit(DatabaseEvents.promiseError, err);

            if (this.throwErrors) {
                throw err;
            }
        }
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
