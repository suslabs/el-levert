import sqlite from "sqlite3";
import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import SqliteStatement from "./SqliteStatement.js";
import SqliteResult from "./SqliteResult.js";

import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseEvents from "./DatabaseEvents.js";
import OpenModes from "./OpenModes.js";

import DatabaseError from "../../../errors/DatabaseError.js";

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
                if (this._throwErrorAsync(resolve, reject, err)) {
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
            if (!this._checkDatabaseOpenAsync(resolve, reject, "Cannot close database. The database is not open")) {
                return;
            }

            this.finalizeAll()
                .then(_ => {
                    this.db.close(err => {
                        if (this._throwErrorAsync(resolve, reject, err)) {
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
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        try {
            return this.db.configure(option, value);
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    run(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            const _this = this;
            this.db.run(sql, ...param, function (err) {
                if (_this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                const st = this;
                resolve(new SqliteResult(undefined, st));
            });
        });
    }

    get(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            const _this = this;
            this.db.get(sql, ...param, function (err, row) {
                if (_this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                const st = this;
                resolve(new SqliteResult(row, st));
            });
        });
    }

    all(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            const _this = this;
            this.db.all(sql, ...param, (err, rows) => {
                if (_this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                const st = this;
                resolve(new SqliteResult(rows, st));
            });
        });
    }

    each(sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            const _this = this;
            this.db.each(sql, param, callback, function (err, nrows) {
                if (_this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                const st = this;
                resolve(new SqliteResult(nrows, st));
            });
        });
    }

    exec(sql) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            this.db.exec(sql, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                resolve();
            });
        });
    }

    prepare(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            let statement;

            let callback = err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
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

            return this._throwErrorSync(err);
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
            if (!this._checkDatabaseOpenAsync()) {
                return;
            }

            this.db.loadExtension(path, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                resolve(this);
            });
        });
    }

    async pragma(pragma) {
        const sql = `PRAGMA ${pragma};`;
        await this.exec(sql);
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
            return this._throwErrorSync(err);
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

    _checkDatabaseOpenSync(msg) {
        if (typeof this.db !== "undefined") {
            return true;
        }

        const err = new DatabaseError(msg ?? "The database is not open");
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            throw err;
        }

        return false;
    }

    _checkDatabaseOpenAsync(resolve, reject, msg) {
        if (typeof this.db !== "undefined") {
            return true;
        }

        const err = new DatabaseError(msg ?? "The database is not open");
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            reject(err);
        } else {
            resolve();
        }

        return false;
    }

    _throwErrorSync(err) {
        err = new DatabaseError(err);
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            throw err;
        }
    }

    _throwErrorAsync(resolve, reject, err) {
        if (!err) {
            return false;
        }

        err = new DatabaseError(err);
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            reject(err);
        } else {
            resolve(this);
        }

        return true;
    }

    _errorRollbackAsync(resolve, reject, err) {
        if (!err) {
            return false;
        }

        err = new DatabaseError(err);
        this.emit(DatabaseEvents.promiseError, err);

        if (this.autoRollback && this.inTransaction) {
            this.rollback()
                .then(_ => {
                    if (this.throwErrors) {
                        reject(err);
                    } else {
                        resolve();
                    }
                })
                .catch(reject);
        } else if (this.throwErrors) {
            reject(err);
        } else {
            resolve();
        }

        return true;
    }
}

export default SqliteDatabase;
