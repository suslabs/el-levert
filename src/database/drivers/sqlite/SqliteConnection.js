import fs from "node:fs/promises";
import path from "node:path";
import EventEmitter from "node:events";

import sqlite from "sqlite3";

import StatementDatabase from "../common/StatementDatabase.js";

import SqliteResult from "./SqliteResult.js";
import SqliteStatement from "./SqliteStatement.js";

import ConnectionEvents from "./ConnectionEvents.js";

import Util from "../../../util/Util.js";
import TypeTester from "../../../util/TypeTester.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

const maxSignedInt32 = BigInt(2147483647),
    minSignedInt32 = BigInt(-2147483648);

class SqliteConnection extends StatementDatabase(EventEmitter) {
    static transactionSql = Object.freeze({
        deferred: "BEGIN DEFERRED TRANSACTION;",
        immediate: "BEGIN IMMEDIATE TRANSACTION;",
        exclusive: "BEGIN EXCLUSIVE TRANSACTION;",
        createSavepoint: "SAVEPOINT {{ name }};",
        releaseSavepoint: "RELEASE SAVEPOINT {{ name }};",
        rollbackToSavepoint: "ROLLBACK TRANSACTION TO SAVEPOINT {{ name }};"
    });

    static pragmaSql = Object.freeze({
        enableWALMode: "journal_mode=WAL",
        disableWALMode: "journal_mode=DELETE"
    });

    static commitSql = "COMMIT TRANSACTION;";
    static rollbackSql = "ROLLBACK TRANSACTION;";

    static vacuumSql = "VACUUM;";

    constructor(config, db = null) {
        super();

        config = TypeTester.isObject(config) ? config : {};
        this.config = config;

        this._setConfig(config);

        this.db = null;
        this.inTransaction = false;

        this._released = false;
        this._savepointId = 0;
        this._loadedExtensions = new Set();

        this._eventId = DatabaseUtil.getEventId();
        this.eventName = `${this.eventPrefix}:${this._eventId}`;

        if (db != null) {
            this._setDatabase(db);
        }
    }

    open() {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject, false, "Cannot open connection. The database is open")) {
                return;
            }

            const db = new sqlite.Database(this.filename, this.mode, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                this._setDatabase(db);
                resolve(this);
            });
        }).then(_ => this._bootstrap());
    }

    close() {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject, true, "Cannot close connection. The database is not open")) {
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

    configure(...args) {
        if (!this._checkOpenSync()) {
            return;
        }

        try {
            this.db.configure(...args);
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    run(sql, ...param) {
        return this._executeSql("run", sql, param, function () {
            return new SqliteResult(undefined, this);
        });
    }

    get(sql, ...param) {
        return this._executeSql("get", sql, param, function (_err, row) {
            return new SqliteResult(row, this);
        });
    }

    all(sql, ...param) {
        return this._executeSql("all", sql, param, function (_err, rows) {
            return new SqliteResult(rows, this);
        });
    }

    each(sql, ...args) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            let param;
            let callback;

            try {
                ({ param, callback } = this._extractEachArgs(args));
            } catch (err) {
                this._throwErrorAsync(resolve, reject, err);
                return;
            }

            this.db.each(sql, param, callback, (err, nrows) => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(new SqliteResult(nrows, this.db));
            });
        });
    }

    exec(sql) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            this.db.exec(sql, err => {
                if (this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(this);
            });
        });
    }

    prepare(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            try {
                param = this._normalizeParams(param);
            } catch (err) {
                this._throwErrorAsync(resolve, reject, err);
                return;
            }

            let st = null;

            st = this.db.prepare(sql, ...param, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                const prepared = new SqliteStatement(this, sql, param, st);
                this.addStatement(prepared);
                resolve(prepared);
            });
        });
    }

    loadExtension(extensionPath) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            const resolved = path.resolve(extensionPath);

            if (this._loadedExtensions.has(resolved)) {
                resolve(this);
                return;
            }

            this.db.loadExtension(resolved, err => {
                if (this._throwErrorAsync(resolve, reject, err)) {
                    return;
                }

                this._loadedExtensions.add(resolved);
                this._extensionPaths.add(resolved);

                resolve(this);
            });
        });
    }

    pragma(pragma, options = {}) {
        return this.all(`PRAGMA ${pragma};`).then(rows => {
            if (!options.simple) {
                return rows;
            }

            const firstRow = rows?.[0];

            if (firstRow == null || typeof firstRow !== "object") {
                return undefined;
            }

            const firstKey = Object.keys(firstRow)[0];
            return firstRow[firstKey];
        });
    }

    enableWALMode() {
        return this.pragma(SqliteConnection.pragmaSql.enableWALMode).then(_ => {
            this.WALMode = true;
            return this;
        });
    }

    disableWALMode() {
        return this.pragma(SqliteConnection.pragmaSql.disableWALMode).then(_ => {
            this.WALMode = false;
            return this;
        });
    }

    interrupt() {
        if (!this._checkOpenSync()) {
            return;
        }

        try {
            this.db.interrupt();
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    vacuum() {
        return this.exec(SqliteConnection.vacuumSql).then(_ => this);
    }

    beginTransaction(mode = this.transactionMode) {
        if (!this._checkOpenSync() || this.inTransaction) {
            return Promise.resolve();
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        const sql = SqliteConnection.transactionSql[mode] ?? SqliteConnection.transactionSql.immediate;

        return this.exec(sql)
            .then(_ => {
                this.inTransaction = true;
            })
            .catch(err => {
                if (original) {
                    throw err;
                }
            })
            .finally(() => {
                this.throwErrors = original;
            });
    }

    commit() {
        if (!this._checkOpenSync() || !this.inTransaction) {
            return Promise.resolve();
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        return this.exec(SqliteConnection.commitSql)
            .then(_ => {
                this.inTransaction = false;
                this.throwErrors = original;
            })
            .catch(err => {
                this.throwErrors = original;

                return this.exec(SqliteConnection.rollbackSql).then(_ => {
                    this.inTransaction = false;
                    return this._throwErrorSync(err);
                });
            });
    }

    rollback() {
        if (!this._checkOpenSync() || !this.inTransaction) {
            return Promise.resolve();
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        return this.exec(SqliteConnection.rollbackSql)
            .then(_ => {
                this.inTransaction = false;
            })
            .catch(err => {
                if (original) {
                    throw err;
                }
            })
            .finally(() => {
                this.throwErrors = original;
            });
    }

    createSavepoint(name) {
        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.createSavepoint, {
            name: DatabaseUtil.quoteIdentifier(name, "Savepoint name")
        });

        return this.exec(sql).then(_ => this);
    }

    releaseSavepoint(name) {
        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.releaseSavepoint, {
            name: DatabaseUtil.quoteIdentifier(name, "Savepoint name")
        });

        return this.exec(sql).then(_ => this);
    }

    rollbackToSavepoint(name) {
        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.rollbackToSavepoint, {
            name: DatabaseUtil.quoteIdentifier(name, "Savepoint name")
        });

        return this.exec(sql).then(_ => this);
    }

    nextSavepointName() {
        this._savepointId++;
        return `el_sqlite_sp_${this._savepointId}`;
    }

    backup(destination, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            const filename = path.resolve(destination);

            const attached = options.attached ?? "main",
                progress = options.progress ?? null;

            const initialPages = Number.isInteger(options.pages) ? options.pages : 100,
                retryErrors = Array.isArray(options.retryErrors) ? options.retryErrors : null;

            fs.mkdir(path.dirname(filename), {
                recursive: true
            })
                .then(_ => {
                    return new Promise((nextResolve, nextReject) => {
                        let backup = null;

                        try {
                            backup = this.db.backup(filename, "main", attached, true, err1 => {
                                if (err1) {
                                    nextReject(DatabaseUtil.wrapError(err1));
                                    return;
                                }

                                nextResolve(backup);
                            });
                        } catch (err1) {
                            nextReject(DatabaseUtil.wrapError(err1));
                        }
                    });
                })
                .then(backup => {
                    if (retryErrors != null) {
                        backup.retryErrors = retryErrors;
                    }

                    let pages = initialPages;

                    const finishBackup = callback => {
                        backup.finish(err1 => {
                            if (err1) {
                                callback(DatabaseUtil.wrapError(err1));
                                return;
                            }

                            callback(null, {
                                totalPages: backup.pageCount,
                                remainingPages: backup.remaining
                            });
                        });
                    };

                    const stepBackup = () => {
                        if (backup.completed || backup.failed) {
                            finishBackup((err1, result) => {
                                if (err1) {
                                    reject(err1);
                                    return;
                                }

                                resolve(result);
                            });
                            return;
                        }

                        backup.step(pages, err1 => {
                            if (err1) {
                                finishBackup(_ => reject(DatabaseUtil.wrapError(err1)));
                                return;
                            }

                            if (typeof progress === "function") {
                                try {
                                    const nextPages = progress({
                                        totalPages: backup.pageCount,
                                        remainingPages: backup.remaining
                                    });

                                    if (Number.isFinite(nextPages)) {
                                        pages = Math.max(0, Math.round(nextPages));
                                    }
                                } catch (err2) {
                                    finishBackup(_ => reject(DatabaseUtil.wrapError(err2)));
                                    return;
                                }
                            }

                            stepBackup();
                        });
                    };

                    stepBackup();
                })
                .catch(reject);
        });
    }

    _setConfig(config) {
        this.filename = config.filename ?? this.filename ?? "";
        this.mode = config.mode ?? this.mode;
        this.eventPrefix = config.eventPrefix ?? this.eventPrefix ?? "con";

        this.WALMode = config.enableWALMode ?? this.WALMode ?? false;

        this.busyTimeout = config.busyTimeout ?? this.busyTimeout ?? null;

        this._extensionPaths = new Set(config.loadExtensions ?? this._extensionPaths ?? []);
        this.transactionMode = config.transactionMode ?? this.transactionMode ?? "immediate";

        this.throwErrors = config.throwErrors ?? this.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? this.autoRollback ?? false;
        this.verbose = config.verbose ?? this.verbose ?? false;
    }

    _checkOpen(expected = true, msg) {
        const open = this.db != null;

        if (open === expected) {
            return true;
        }

        return new DatabaseError(msg ?? "The database is not open");
    }

    _checkOpenSync(expected, msg) {
        return DatabaseUtil.checkSync(this, ConnectionEvents.promiseError, this.throwErrors, this._checkOpen(expected, msg));
    }

    _checkOpenAsync(resolve, reject, expected, msg) {
        return DatabaseUtil.checkAsync(
            this,
            ConnectionEvents.promiseError,
            this.throwErrors,
            resolve,
            reject,
            this._checkOpen(expected, msg)
        );
    }

    _throwErrorSync(err) {
        return DatabaseUtil.throwSync(this, ConnectionEvents.promiseError, this.throwErrors, err);
    }

    _throwErrorAsync(resolve, reject, err) {
        return DatabaseUtil.throwAsync(this, ConnectionEvents.promiseError, this.throwErrors, resolve, reject, err);
    }

    _errorRollbackAsync(resolve, reject, err) {
        const wrapped = err ? DatabaseUtil.wrapError(err) : false;

        if (!wrapped) {
            return false;
        }

        this.emit(ConnectionEvents.promiseError, wrapped);

        if (this.autoRollback && this.inTransaction) {
            this.rollback()
                .then(_ => {
                    this.emit(ConnectionEvents.autoRollback);

                    if (this.throwErrors) {
                        reject(wrapped);
                    } else {
                        resolve();
                    }
                })
                .catch(reject);
        } else if (this.throwErrors) {
            reject(wrapped);
        } else {
            resolve();
        }

        return true;
    }

    _normalizeParam(param) {
        if (typeof param === "bigint") {
            if (param < minSignedInt32 || param > maxSignedInt32) {
                throw new DatabaseError("BigInt parameters are only supported within signed 32-bit integer range");
            }

            return Number(param);
        }

        if (Array.isArray(param)) {
            return param.map(item => this._normalizeParam(item));
        }

        if (param instanceof Date || Buffer.isBuffer(param) || param == null) {
            return param;
        }

        if (typeof param === "object") {
            const normalized = {};

            for (const [key, value] of Object.entries(param)) {
                normalized[key] = this._normalizeParam(value);
            }

            return normalized;
        }

        return param;
    }

    _normalizeParams(params) {
        return params.map(param => this._normalizeParam(param));
    }

    _executeSql(method, sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            try {
                param = this._normalizeParams(param);
            } catch (err) {
                this._throwErrorAsync(resolve, reject, err);
                return;
            }

            const _this = this;
            this.db[method](sql, ...param, function (err, ...args) {
                if (_this._errorRollbackAsync(resolve, reject, err)) {
                    return;
                }

                resolve(callback.call(this, err, ...args));
            });
        });
    }

    _extractEachArgs(args) {
        if (Util.empty(args)) {
            throw new DatabaseError("Callback argument is required");
        }

        const callback = args.at(-1);

        if (typeof callback !== "function") {
            throw new DatabaseError("Callback argument is required");
        }

        return {
            param: args.length > 1 ? this._normalizeParam(args[0]) : [],
            callback
        };
    }

    _setDatabase(db) {
        this.db = db;

        this._released = false;
        this._loadedExtensions.clear();

        DatabaseUtil.registerEvents(db, this, ConnectionEvents);
    }

    _deleteDatabase() {
        if (this.db == null) {
            return;
        }

        this.db.configure = _ => {};
        DatabaseUtil.removeEvents(this.db, this, ConnectionEvents);

        this.db = null;
        this.inTransaction = false;
    }

    _bootstrap() {
        let chain = Promise.resolve();

        if (this.busyTimeout != null) {
            chain = chain.then(_ => this.configure("busyTimeout", this.busyTimeout));
        }

        for (const extensionPath of this._extensionPaths) {
            chain = chain.then(_ => this.loadExtension(extensionPath));
        }

        if (this.WALMode) {
            chain = chain.then(_ => this.pragma(SqliteConnection.pragmaSql.enableWALMode));
        }

        return chain.then(_ => this);
    }
}

export default SqliteConnection;
