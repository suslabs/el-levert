import sqlite from "sqlite3";
import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import SqliteStatement from "./SqliteStatement.js";
import SqliteResult from "./SqliteResult.js";

import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseEvents from "./DatabaseEvents.js";
import OpenModes from "./OpenModes.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteDatabase extends StatementDatabase(EventEmitter) {
    static transactionSql = {
        begin: "BEGIN TRANSACTION;",
        commit: "END TRANSACTION;",
        rollback: "ROLLBACK TRANSACTION;"
    };

    static journalModePragmas = {
        enableWAL: "journal_mode=WAL",
        disableWAL: "journal_mode=DELETE"
    };

    static vacuumSql = "VACUUM;";

    constructor(filename, mode, config = {}) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        this.config = config;

        this.WALMode = config.enableWALMode ?? false;
        this.throwErrors = config.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? false;

        this.db = null;
        this.inTransaction = false;
    }

    open() {
        return new Promise((resolve, reject) => {
            if (
                !this._checkDatabaseOpenAsync(
                    resolve,
                    reject,
                    false,
                    `Cannot open database. ${SqliteDatabase._dbOpenMsg}`
                )
            ) {
                return;
            }

            const db = new sqlite.Database(this.filename, this.mode, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                this._setDatabase(db);
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
            if (
                !this._checkDatabaseOpenAsync(
                    resolve,
                    reject,
                    true,
                    `Cannot close database. ${SqliteDatabase._dbNotOpenMsg}`
                )
            ) {
                return;
            }

            this.finalizeAll()
                .then(_ => {
                    this.db.close(err => {
                        if (this._throwErrorAsync(resolve, reject, err)) {
                            return;
                        }

                        this._deleteDatabase();
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
            await this.exec(SqliteDatabase.transactionSql.begin);
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
            await this.exec(SqliteDatabase.transactionSql.commit);
            this.inTransaction = false;

            this.throwErrors = original;
        } catch (err) {
            this.throwErrors = original;
            await this.exec(SqliteDatabase.transactionSql.rollback);

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
            await this.exec(SqliteDatabase.transactionSql.rollback);
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
        await this.pragma(SqliteDatabase.journalModePragmas.enableWAL);
        this.WALMode = true;
    }

    async disableWALMode() {
        await this.pragma(SqliteDatabase.journalModePragmas.disableWAL);
        this.WALMode = false;
    }

    interrupt() {
        try {
            this.db.interrupt();
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    async vacuum() {
        await this.run(SqliteDatabase.vacuumSql);
    }

    static _dbOpenMsg = "The database is open";
    static _dbNotOpenMsg = "The database is not open";

    _setDatabase(db) {
        this.db = db;
        DatabaseUtil.registerEvents(this.db, this, DatabaseEvents);
    }

    _deleteDatabase() {
        this.db.configure = _ => {};
        DatabaseUtil.removeEvents(this.db, this, DatabaseEvents);

        this.db = null;
    }

    _checkDatabaseOpen(expected = true, msg) {
        const open = this.db !== null;

        if (open === expected) {
            return true;
        }

        if (expected) {
            return new DatabaseError(msg ?? SqliteDatabase._dbNotOpenMsg);
        } else {
            return new DatabaseError(msg ?? SqliteDatabase._dbOpenMsg);
        }
    }

    _checkDatabaseOpenSync(expected, msg) {
        const res = this._checkDatabaseOpen(expected, msg);

        if (typeof res === "boolean") {
            return res;
        }

        this.emit(DatabaseEvents.promiseError, res);

        if (this.throwErrors) {
            throw res;
        }

        return false;
    }

    _checkDatabaseOpenAsync(resolve, reject, expected, msg) {
        const res = this._checkDatabaseOpen(expected, msg);

        if (typeof res === "boolean") {
            return res;
        }

        this.emit(DatabaseEvents.promiseError, res);

        if (this.throwErrors) {
            reject(res);
        } else {
            resolve();
        }

        return false;
    }

    _throwErrorSync(err) {
        if (!err) {
            return false;
        }

        err = new DatabaseError(err);
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            throw err;
        }

        return false;
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
