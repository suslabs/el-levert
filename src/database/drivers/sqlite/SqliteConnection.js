import fs from "node:fs/promises";
import path from "node:path";
import EventEmitter from "node:events";

import sqlite from "sqlite3";

import StatementDatabase from "../common/StatementDatabase.js";

import SqliteResult from "./SqliteResult.js";
import SqliteStatement from "./SqliteStatement.js";

import { ConnectionEvents } from "./ConnectionEvents.js";

import Util from "../../../util/Util.js";
import ObjectUtil from "../../../util/ObjectUtil.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteConnection extends StatementDatabase(EventEmitter) {
    static transactionSql = Object.freeze({
        deferred: "BEGIN DEFERRED TRANSACTION;",
        immediate: "BEGIN IMMEDIATE TRANSACTION;",
        exclusive: "BEGIN EXCLUSIVE TRANSACTION;",
        createSavepoint: "SAVEPOINT {{name}};",
        releaseSavepoint: "RELEASE SAVEPOINT {{name}};",
        rollbackToSavepoint: "ROLLBACK TRANSACTION TO SAVEPOINT {{name}};"
    });

    static pragmaSql = Object.freeze({
        run: "PRAGMA {{pragma}};",
        tableInfo: "table_info({{tableName}})",
        tableXInfo: "table_xinfo({{tableName}})",
        foreignKeyList: "foreign_key_list({{tableName}})",
        indexList: "index_list({{tableName}})",
        indexInfo: "index_info({{indexName}})",
        enableForeignKeys: "foreign_keys=ON",
        enableWALMode: "journal_mode=WAL",
        disableWALMode: "journal_mode=DELETE"
    });

    static schemaSql = Object.freeze({
        tableExists: "SELECT name FROM sqlite_master WHERE type = 'table' AND name = $name;"
    });

    static commitSql = "COMMIT TRANSACTION;";
    static rollbackSql = "ROLLBACK TRANSACTION;";

    static vacuumSql = "VACUUM;";

    constructor(config, db = null) {
        super();

        config = ObjectUtil.guaranteeObject(config);
        this.config = config;

        this._setConfig(config);
        this._setDatabase(db);

        this.inTransaction = false;

        this._released = false;
        this._savepointId = 0;

        this._loadedExtensions = new Set();
        this._registeredFunctions = new Set();

        this._eventId = DatabaseUtil.getEventId();
        this.eventName = `${this.eventPrefix}:${this._eventId}`;
    }

    open() {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject, false, "Cannot open connection. The database is already open")) {
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
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            try {
                this.db.each(sql, param, callback, (err, nrows) => {
                    if (this._errorRollbackAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve(new SqliteResult(nrows, this.db));
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
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
        return this._prepareStatement(sql, param);
    }

    prepareTemplate(sql, defaultParam = [], template = null) {
        return this._prepareStatement(sql, defaultParam, template);
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

    createFunction(name, callback, argc = -1, deterministic = false) {
        if (!this._checkOpenSync()) {
            return;
        }

        try {
            this.db.createFunction(name, callback, argc, deterministic);
            this._registeredFunctions.add(`${name}:${argc}`);
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    defaultSafeIntegers(enabled = true) {
        if (!this._checkOpenSync()) {
            return;
        }

        try {
            this.db.defaultSafeIntegers(enabled);
            this.safeIntegers = enabled;
            return this;
        } catch (err) {
            return this._throwErrorSync(err);
        }
    }

    async pragma(pragma, options = {}) {
        const sql = RegexUtil.templateReplace(SqliteConnection.pragmaSql.run, { pragma });
        const rows = await this.all(sql);

        if (!options.simple) {
            return rows;
        }

        const firstRow = rows?.[0];

        if (typeof firstRow === "undefined" || typeof firstRow !== "object") {
            return undefined;
        }

        const firstKey = Object.keys(firstRow)[0];
        return firstRow[firstKey];
    }

    tableInfo(table) {
        return this._identifierPragma(SqliteConnection.pragmaSql.tableInfo, "tableName", table, "Table name");
    }

    tableXInfo(table) {
        return this._identifierPragma(SqliteConnection.pragmaSql.tableXInfo, "tableName", table, "Table name");
    }

    foreignKeyList(table) {
        return this._identifierPragma(SqliteConnection.pragmaSql.foreignKeyList, "tableName", table, "Table name");
    }

    indexList(table) {
        return this._identifierPragma(SqliteConnection.pragmaSql.indexList, "tableName", table, "Table name");
    }

    indexInfo(index) {
        return this._identifierPragma(SqliteConnection.pragmaSql.indexInfo, "indexName", index, "Index name");
    }

    async tableExists(table) {
        const row = await this.get(SqliteConnection.schemaSql.tableExists, { $name: table });
        return typeof row._data !== "undefined";
    }

    async tableSchema(table) {
        const [base, extended] = await Promise.all([this.tableInfo(table), this.tableXInfo(table)]);

        return {
            base: new Set(base.map(row => row.name)),
            extended: new Set(extended.map(row => row.name)),
            baseColumns: new Map(base.map(row => [row.name, row])),
            extendedColumns: new Map(extended.map(row => [row.name, row]))
        };
    }

    async tableDetails(table) {
        const [exists, schema, foreignKeys, indexes] = await Promise.all([
            this.tableExists(table),
            this.tableSchema(table),
            this.foreignKeyList(table),
            this.indexList(table)
        ]);

        const indexColumns = new Map();

        for (const index of indexes) {
            indexColumns.set(index.name, await this.indexInfo(index.name));
        }

        return {
            exists,
            ...schema,
            foreignKeys,
            indexes,
            indexColumns
        };
    }

    async enableWALMode() {
        await this.pragma(SqliteConnection.pragmaSql.enableWALMode);
        this.WALMode = true;
        return this;
    }

    async disableWALMode() {
        await this.pragma(SqliteConnection.pragmaSql.disableWALMode);
        this.WALMode = false;
        return this;
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

    async vacuum() {
        await this.exec(SqliteConnection.vacuumSql);
        return this;
    }

    async beginTransaction(mode = this.transactionMode) {
        if (!(await this._checkOpenPromise()) || this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        const sql = SqliteConnection.transactionSql[mode] ?? SqliteConnection.transactionSql.immediate;

        try {
            await this.exec(sql);
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
        if (!(await this._checkOpenPromise()) || !this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        try {
            await this.exec(SqliteConnection.commitSql);
            this.inTransaction = false;
        } catch (err) {
            await this.exec(SqliteConnection.rollbackSql).catch(_ => {});
            this.inTransaction = false;

            if (original) {
                throw err;
            }
        } finally {
            this.throwErrors = original;
        }
    }

    async rollback() {
        if (!(await this._checkOpenPromise()) || !this.inTransaction) {
            return;
        }

        const original = this.throwErrors;
        this.throwErrors = true;

        try {
            await this.exec(SqliteConnection.rollbackSql);
            this.inTransaction = false;
        } catch (err) {
            if (original) {
                throw err;
            }
        } finally {
            this.throwErrors = original;
        }
    }

    async createSavepoint(name) {
        const savepoint = this._quoteIdentifier(name, "Savepoint name");

        if (savepoint === null) {
            return;
        }

        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.createSavepoint, {
            name: savepoint
        });

        await this.exec(sql);
        return this;
    }

    async releaseSavepoint(name) {
        const savepoint = this._quoteIdentifier(name, "Savepoint name");

        if (savepoint === null) {
            return;
        }

        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.releaseSavepoint, {
            name: savepoint
        });

        await this.exec(sql);
        return this;
    }

    async rollbackToSavepoint(name) {
        const savepoint = this._quoteIdentifier(name, "Savepoint name");

        if (savepoint === null) {
            return;
        }

        const sql = RegexUtil.templateReplace(SqliteConnection.transactionSql.rollbackToSavepoint, {
            name: savepoint
        });

        await this.exec(sql);
        return this;
    }

    nextSavepointName() {
        this._savepointId++;
        return `el_sqlite_sp_${this._savepointId}`;
    }

    async backup(destination, options = {}) {
        if (!(await this._checkOpenPromise())) {
            return;
        }

        const filename = path.resolve(destination);

        const attached = options.attached ?? "main",
            progress = options.progress ?? null;

        const initialPages = Number.isInteger(options.pages) ? options.pages : 100,
            retryErrors = Array.isArray(options.retryErrors) ? options.retryErrors : null;

        try {
            await fs.mkdir(path.dirname(filename), {
                recursive: true
            });
        } catch (err) {
            return await this._throwErrorPromise(err);
        }

        const backup = await new Promise((resolve, reject) => {
            let backupHandle = null;

            try {
                backupHandle = this.db.backup(filename, "main", attached, true, err => {
                    if (this._throwErrorAsync(resolve, reject, err, null)) {
                        return;
                    }

                    resolve(backupHandle);
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err, null);
            }
        });

        if (backup === null) {
            return;
        }

        if (retryErrors !== null) {
            backup.retryErrors = retryErrors;
        }

        let pages = initialPages;

        const finishBackup = () =>
            new Promise((resolve, reject) => {
                backup.finish(err => {
                    if (this._throwErrorAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve({
                        totalPages: backup.pageCount,
                        remainingPages: backup.remaining
                    });
                });
            });

        const stepBackup = () =>
            new Promise((resolve, reject) => {
                backup.step(pages, err => {
                    if (this._throwErrorAsync(resolve, reject, err, false)) {
                        return;
                    }

                    resolve(true);
                });
            });

        while (!backup.completed && !backup.failed) {
            const stepped = await stepBackup();

            if (!stepped) {
                await finishBackup().catch(_ => {});
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
                } catch (err) {
                    await finishBackup().catch(_ => {});
                    return await this._throwErrorPromise(err);
                }
            }
        }

        return await finishBackup();
    }

    _setConfig(config) {
        this.filename = config.filename ?? this.filename ?? "";
        this.mode = config.mode ?? this.mode;
        this.eventPrefix = config.eventPrefix ?? this.eventPrefix ?? "con";

        this.WALMode = config.enableWALMode ?? this.WALMode ?? false;

        this.busyTimeout = config.busyTimeout ?? this.busyTimeout ?? null;

        this._extensionPaths = new Set(config.loadExtensions ?? this._extensionPaths ?? []);
        this._customFunctions = new Map(config.customFunctions ?? this._customFunctions ?? []);

        this.safeIntegers = config.safeIntegers ?? this.safeIntegers ?? false;
        this.transactionMode = config.transactionMode ?? this.transactionMode ?? "immediate";

        this.verbose = config.verbose ?? this.verbose ?? false;
        this.throwErrors = config.throwErrors ?? this.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? this.autoRollback ?? false;
    }

    _setDatabase(db = null) {
        this.db = db;

        if (db === null) {
            return;
        }

        this._released = false;
        this._loadedExtensions.clear();

        DatabaseUtil.registerEvents(db, this, ConnectionEvents);
    }

    async _bootstrap() {
        if (this.busyTimeout !== null) {
            this.configure("busyTimeout", this.busyTimeout);
        }

        for (const extensionPath of this._extensionPaths) {
            await this.loadExtension(extensionPath);
        }

        for (const { name, callback, argc, deterministic } of this._customFunctions.values()) {
            this.createFunction(name, callback, argc, deterministic);
        }

        if (this.safeIntegers) {
            this.defaultSafeIntegers(true);
        }

        await this.pragma(SqliteConnection.pragmaSql.enableForeignKeys);

        if (this.WALMode) {
            await this.pragma(SqliteConnection.pragmaSql.enableWALMode);
        }

        return this;
    }

    _deleteDatabase() {
        if (this.db === null) {
            return;
        }

        this.db.configure = _ => {};
        DatabaseUtil.removeEvents(this.db, this, ConnectionEvents);

        this.db = null;
        this.inTransaction = false;
    }

    _normalizeParam(param) {
        return param;
    }

    _normalizeParams(params) {
        return params.map(param => this._normalizeParam(param));
    }

    _prepareStatement(sql, defaultParam, template = null) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            try {
                defaultParam = this._normalizeParams(defaultParam);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            let rawSt = null;

            try {
                rawSt = this.db.prepare(sql, ...defaultParam, err => {
                    if (this._throwErrorAsync(resolve, reject, err)) {
                        return;
                    }

                    const prepared = new SqliteStatement(this, sql, defaultParam, rawSt, {
                        template
                    });

                    this.addStatement(prepared);
                    resolve(prepared);
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
        });
    }

    _executeSql(method, sql, param, callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkOpenAsync(resolve, reject)) {
                return;
            }

            try {
                param = this._normalizeParams(param);
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
                return;
            }

            const _this = this;

            try {
                this.db[method](sql, ...param, function (err, ...args) {
                    if (_this._errorRollbackAsync(resolve, reject, err)) {
                        return;
                    }

                    resolve(callback.call(this, err, ...args));
                });
            } catch (err) {
                DatabaseUtil.settleSyncError(this, resolve, reject, err);
            }
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

    _quoteIdentifier(name, label) {
        try {
            return DatabaseUtil.quoteIdentifier(name, label);
        } catch (err) {
            this._throwErrorSync(err);
            return null;
        }
    }

    async _identifierPragma(template, identifierName, identifierValue, label) {
        const quotedIdentifier = this._quoteIdentifier(identifierValue, label);

        if (quotedIdentifier === null) {
            return;
        }

        const pragma = RegexUtil.templateReplace(template, {
                [identifierName]: quotedIdentifier
            }),
            rows = await this.pragma(pragma);

        return typeof rows === "undefined" ? rows : Array.from(rows);
    }

    _checkOpen(expected = true, msg) {
        const open = this.db !== null;

        if (open === expected) {
            return true;
        }

        return new DatabaseError(msg ?? "The database is not open");
    }

    _checkOpenSync(expected, msg) {
        return DatabaseUtil.checkSync(
            this,
            ConnectionEvents.promiseError,
            this.throwErrors,
            this._checkOpen(expected, msg)
        );
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

    async _checkOpenPromise(expected, msg, resolveValue) {
        return await DatabaseUtil.checkPromise(
            this,
            ConnectionEvents.promiseError,
            this.throwErrors,
            this._checkOpen(expected, msg),
            resolveValue
        );
    }

    _throwErrorSync(err) {
        return DatabaseUtil.throwSync(this, ConnectionEvents.promiseError, this.throwErrors, err);
    }

    _throwErrorAsync(resolve, reject, err, resolveValue) {
        return DatabaseUtil.throwAsync(
            this,
            ConnectionEvents.promiseError,
            this.throwErrors,
            resolve,
            reject,
            err,
            resolveValue
        );
    }

    _errorRollbackAsync(resolve, reject, err) {
        if (!err) {
            return false;
        }

        if (this.autoRollback && this.inTransaction) {
            this.rollback()
                .then(_ => {
                    this.emit(ConnectionEvents.autoRollback);
                    this._throwErrorAsync(resolve, reject, err);
                })
                .catch(reject);
        } else {
            this._throwErrorAsync(resolve, reject, err);
        }

        return true;
    }

    async _throwErrorPromise(err, resolveValue) {
        return await DatabaseUtil.throwPromise(
            this,
            ConnectionEvents.promiseError,
            this.throwErrors,
            err,
            resolveValue
        );
    }
}

export default SqliteConnection;
