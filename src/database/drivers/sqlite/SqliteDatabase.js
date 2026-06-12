import path from "node:path";
import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import SqlitePool from "./SqlitePool.js";
import SqliteStatement from "./SqliteStatement.js";

import MigrationLoader from "../../../loaders/migration/MigrationLoader.js";

import { PoolEvents } from "./PoolEvents.js";
import { ConnectionEvents } from "./ConnectionEvents.js";
import { EventPrefixes } from "./EventPrefixes.js";
import { DatabaseEvents } from "./DatabaseEvents.js";
import { OpenModes } from "./OpenModes.js";

import ObjectUtil from "../../../util/ObjectUtil.js";
import Util from "../../../util/Util.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";
import RegexUtil from "../../../util/misc/RegexUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteDatabase extends StatementDatabase(EventEmitter) {
    static migrationSql = Object.freeze({
        createTable:
            "CREATE TABLE IF NOT EXISTS {{tableName}} " +
            "(id INTEGER PRIMARY KEY, name TEXT NOT NULL, up TEXT NOT NULL, down TEXT NOT NULL)",
        selectApplied: "SELECT id, name, up, down FROM {{tableName}} ORDER BY id ASC",
        deleteApplied: "DELETE FROM {{tableName}} WHERE id = $id",
        insertApplied: "INSERT INTO {{tableName}} (id, name, up, down) VALUES ($id, $name, $up, $down)"
    });

    constructor(filename, mode, config, session) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        config = ObjectUtil.guaranteeObject(config);
        this.config = config;
        this.options = {};

        this._setConfig(config);

        this.pool = null;
        this.inTransaction = false;

        this._root = null;
        this._conn = null;

        this._released = false;
        this._autoRollbackListener = null;
        this._connectionListeners = new WeakMap();

        if (session != null) {
            this._initSession(session.root, session.conn, session.options);
        }
    }

    open() {
        if (
            !this._checkSessionClosedSync() ||
            !this._checkDatabaseClosedSync(`Cannot open database. ${SqliteDatabase._dbOpenMsg}`)
        ) {
            return;
        }

        const pool = new SqlitePool(this._getPoolConfig());
        DatabaseUtil.registerPrefixedEvents(pool, this, EventPrefixes.pool, PoolEvents);
        this.pool = pool;

        return this;
    }

    async close() {
        if (this._inSession) {
            return await this._dispose();
        }

        if (!(await this._checkDatabaseOpenPromise(`Cannot close database. ${SqliteDatabase._dbNotOpenMsg}`))) {
            return;
        }

        await this.finalizeAll();

        await this.pool.empty();
        DatabaseUtil.removePrefixedEvents(this.pool, this, EventPrefixes.pool, PoolEvents);
        this.pool = null;
    }

    configure(...args) {
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        if (this._inSession) {
            this._conn.configure(...args);
        } else {
            for (const conn of this.pool.connections) {
                conn.configure(...args);
            }
        }

        if (args[0] === "busyTimeout") {
            this._setBusyTimeout(args[1]);
            this._applyConfig({
                busyTimeout: args[1]
            });
        }

        return this;
    }

    run(sql, ...param) {
        return this._callConnection("run", sql, ...param);
    }

    get(sql, ...param) {
        return this._callConnection("get", sql, ...param);
    }

    all(sql, ...param) {
        return this._callConnection("all", sql, ...param);
    }

    each(sql, ...args) {
        return this._callConnection("each", sql, ...args);
    }

    exec(sql) {
        return this._callConnection("exec", sql);
    }

    use(callback) {
        if (this._inSession) {
            return callback(this);
        }

        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        return this._useManagedSession(callback);
    }

    async prepare(sql, ...param) {
        if (!(await this._checkDatabaseOpenPromise())) {
            return;
        }

        return await this._prepareStatement(sql, param);
    }

    async beginTransaction(mode = this.transactionMode) {
        if (!(await this._checkDatabaseOpenPromise())) {
            return;
        }

        return await this._beginTransaction(mode);
    }

    async commit() {
        if (this._inSession) {
            await this._commitTransaction();
            return await this._finalizeTransactionEnd();
        } else {
            if (!(await this._checkDatabaseOpenPromise())) {
                return;
            }

            return await this._throwErrorPromise(
                new DatabaseError("Cannot commit the pooled root database. Commit the session instead.")
            );
        }
    }

    async rollback() {
        if (this._inSession) {
            await this._rollbackTransaction();
            return await this._finalizeTransactionEnd();
        } else {
            if (!(await this._checkDatabaseOpenPromise())) {
                return;
            }

            return await this._throwErrorPromise(
                new DatabaseError("Cannot roll back the pooled root database. Roll back the session instead.")
            );
        }
    }

    async transaction(callback, mode = this.transactionMode) {
        if (!(await this._checkDatabaseOpenPromise())) {
            return;
        }

        return await this._runTransaction(callback, mode);
    }

    transactionDeferred(callback) {
        return this.transaction(callback, "deferred");
    }

    transactionImmediate(callback) {
        return this.transaction(callback, "immediate");
    }

    transactionExclusive(callback) {
        return this.transaction(callback, "exclusive");
    }

    async loadExtension(extensionPath) {
        const resolved = path.resolve(extensionPath),
            conn = await this._useConnection(activeConnection => activeConnection.loadExtension(resolved));

        if (conn === null) {
            return;
        }

        this._addExtensionPath(resolved);

        this._applyConfig({
            loadExtensions: this._getExtensionPaths()
        });

        return this;
    }

    createFunction(name, callback, argc = -1, deterministic = false) {
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        const state = this._state,
            key = `${name}:${argc}`;

        state._customFunctions.set(key, {
            name,
            callback,
            argc,
            deterministic
        });

        const target = this._inSession ? this._conn : this.pool;
        target.createFunction(name, callback, argc, deterministic);

        return this;
    }

    defaultSafeIntegers(enabled = true) {
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        this.safeIntegers = enabled;
        this._state.safeIntegers = enabled;

        this._applyConfig({
            safeIntegers: enabled
        });

        const target = this._inSession ? this._conn : this.pool;
        target.defaultSafeIntegers(enabled);

        return this;
    }

    pragma(pragma, options) {
        return this._callConnection("pragma", pragma, options);
    }

    tableInfo(table) {
        return this._callConnection("tableInfo", table);
    }

    tableXInfo(table) {
        return this._callConnection("tableXInfo", table);
    }

    foreignKeyList(table) {
        return this._callConnection("foreignKeyList", table);
    }

    indexList(table) {
        return this._callConnection("indexList", table);
    }

    indexInfo(index) {
        return this._callConnection("indexInfo", index);
    }

    tableExists(table) {
        return this._callConnection("tableExists", table);
    }

    tableSchema(table) {
        return this._callConnection("tableSchema", table);
    }

    tableDetails(table) {
        return this._callConnection("tableDetails", table);
    }

    async enableWALMode() {
        const conn = await this._useConnection(activeConnection => activeConnection.enableWALMode());

        if (conn === null) {
            return;
        }

        this._setWALMode(true);
        this._applyConfig({
            enableWALMode: true
        });

        return this;
    }

    async disableWALMode() {
        const conn = await this._useConnection(activeConnection => activeConnection.disableWALMode());

        if (conn === null) {
            return;
        }

        this._setWALMode(false);
        this._applyConfig({
            enableWALMode: false
        });

        return this;
    }

    interrupt() {
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        for (const conn of this._getInterruptConnections()) {
            conn.interrupt();
        }

        return this;
    }

    async vacuum() {
        await this._callConnection("vacuum");
        return this;
    }

    backup(destination, options) {
        return this._callConnection("backup", destination, options);
    }

    async migrate({ force, table = "migrations", migrationsPath = "./migrations" } = {}) {
        const tableName = this._quoteIdentifier(table, "Migration table name");

        if (tableName === null) {
            return;
        }

        const sql = this._getMigrationSql(tableName),
            location = path.resolve(migrationsPath),
            migrations = await this._getMigrations(location);

        await this.transactionImmediate(async tx => {
            await this._withMigrationStatements(tx, sql, async sts => {
                const appliedRows = await sts.selectApplied.all();
                await this._syncMigrations(tx, sts, migrations, appliedRows, force);
            });
        });

        return this;
    }

    static _dbOpenMsg = "The database is open";
    static _dbNotOpenMsg = "The database is not open";
    static _sessionNotOpenMsg = "The database session is not open";

    _setConfig(config) {
        this.WALMode = config.enableWALMode ?? false;

        this.min = config.min ?? 1;
        this.max = config.max ?? 4;

        this.acquireTimeout = config.acquireTimeout ?? 1000;
        this.busyTimeout = config.busyTimeout;
        this.delayRelease = config.delayRelease ?? false;

        this._extensionPaths = new Set(Array.from(config.loadExtensions ?? [], item => path.resolve(item)));
        this._customFunctions = new Map(config.customFunctions ?? []);

        this.safeIntegers = config.safeIntegers ?? false;
        this.transactionMode = config.transactionMode ?? "immediate";

        this.verbose = config.verbose ?? false;
        this.throwErrors = config.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? false;
    }

    _setRoot(root) {
        this.pool = root.pool;
        this._root = root;
    }

    _syncRootState(root) {
        this.throwErrors = root.throwErrors;
        this.autoRollback = root.autoRollback;

        this.WALMode = root.WALMode;
        this.busyTimeout = root.busyTimeout;
        this.delayRelease = root.delayRelease;
        this._customFunctions = root._customFunctions;
        this.safeIntegers = root.safeIntegers;
        this.transactionMode = root.transactionMode;
    }

    _setOptions(options) {
        this._closeOnEnd = options.closeOnEnd ?? false;
    }

    _registerConnection(conn, target) {
        let listeners = this._connectionListeners.get(conn);

        if (typeof listeners === "undefined") {
            listeners = new Map();
            this._connectionListeners.set(conn, listeners);
        }

        const prefixedListeners = new Map();

        for (const event of DatabaseUtil.getEventValues(ConnectionEvents)) {
            const listener = (...args) => target.emit(`${conn.eventName}_${event}`, ...args);
            conn.on(event, listener);
            prefixedListeners.set(event, listener);
        }

        const promiseErrorListener = err => target.emit(DatabaseEvents.promiseError, err);
        conn.on(ConnectionEvents.promiseError, promiseErrorListener);

        listeners.set(target, {
            prefixedListeners,
            promiseErrorListener
        });
    }

    _setConnection(conn) {
        this._conn = conn;
        this.inTransaction = conn.inTransaction;

        this._root._registerConnection(conn, this);
    }

    async _releaseConnection(conn, target = this) {
        if (this.delayRelease) {
            await new Promise(resolve => setImmediate(resolve));
        }

        const listeners = this._connectionListeners.get(conn);
        const targetListeners = listeners.get(target);

        for (const [event, listener] of targetListeners.prefixedListeners) {
            conn.removeListener(event, listener);
        }

        conn.removeListener(ConnectionEvents.promiseError, targetListeners.promiseErrorListener);
        listeners.delete(target);

        if (Util.empty(listeners)) {
            this._connectionListeners.delete(conn);
        }

        conn.release();
    }

    async _dispose() {
        if (!this._inSession || this._released) {
            return;
        }

        this._released = true;

        await this.finalizeAll().catch(_ => {});

        if (this._conn.inTransaction) {
            await this._conn.rollback().catch(_ => {});
        }

        this._conn.removeListener(ConnectionEvents.autoRollback, this._autoRollbackListener);
        this._autoRollbackListener = null;

        await this._root._releaseConnection(this._conn, this);

        this._conn = null;
        this.inTransaction = false;
    }

    _setAutoRollbackHandler() {
        this._autoRollbackListener = () => {
            this.inTransaction = false;

            if (this._closeOnEnd) {
                this._dispose().catch(_ => {});
            }
        };

        this._conn.on(ConnectionEvents.autoRollback, this._autoRollbackListener);
    }

    _initSession(root, conn, options) {
        this.options = ObjectUtil.guaranteeObject(options);

        this._setRoot(root);
        this._syncRootState(root);

        this._setOptions(this.options);

        this._setConnection(conn);

        this._setAutoRollbackHandler();
    }

    get _inSession() {
        return this._root !== null;
    }

    get _open() {
        if (this._inSession) {
            return this._conn !== null && !this._released && this._conn.db !== null;
        }

        return this.pool !== null;
    }

    _getPoolConfig() {
        return {
            ...this.config,

            enableWALMode: this.WALMode,

            min: this.min,
            max: this.max,

            acquireTimeout: this.acquireTimeout,

            busyTimeout: this.busyTimeout,
            delayRelease: this.delayRelease,

            loadExtensions: this._extensionPaths,
            customFunctions: this._customFunctions,
            safeIntegers: this.safeIntegers,
            transactionMode: this.transactionMode,

            verbose: this.verbose,
            throwErrors: this.throwErrors,
            autoRollback: this.autoRollback,

            filename: this.filename,
            mode: this.mode,
            eventPrefix: EventPrefixes.connection
        };
    }

    get _state() {
        return this._root ?? this;
    }

    _applyConfig(config) {
        this._state.pool.applyConfig(config);
    }

    _addExtensionPath(resolved) {
        this._state._extensionPaths.add(resolved);
    }

    _getExtensionPaths() {
        return this._state._extensionPaths;
    }

    _setWALMode(enabled) {
        this.WALMode = enabled;
        this._state.WALMode = enabled;
    }

    _setBusyTimeout(value) {
        this.busyTimeout = value;
        this._state.busyTimeout = value;
    }

    _getInterruptConnections() {
        return this._inSession ? [this._conn] : this.pool.connections;
    }

    _ownStatement(st) {
        st.setOwner(this);
        this.addStatement(st);
        return st;
    }

    _createStatement(sql, param) {
        return this._ownStatement(new SqliteStatement(this, sql, param));
    }

    async _prepareStatement(sql, param) {
        if (!this._inSession) {
            return this._createStatement(sql, param);
        }

        const st = await this._conn.prepare(sql, ...param);
        return this._ownStatement(st);
    }

    async _acquireConnection() {
        const conn = await this.pool.acquire();
        this._registerConnection(conn, this);
        return conn;
    }

    async _createSession(options = {}) {
        const conn = await this.pool.acquire();

        return new SqliteDatabase(this.filename, this.mode, this.config, {
            root: this,
            conn,
            options
        });
    }

    async _useManagedSession(callback, options = {}) {
        const session = await this._createSession(options);

        try {
            return await callback(session);
        } finally {
            await session.close().catch(_ => {});
        }
    }

    async _beginTransaction(mode) {
        if (!this._inSession) {
            const session = await this._createSession({
                closeOnEnd: true
            });

            return await session.beginTransaction(mode);
        }

        if (this.inTransaction) {
            return this;
        }

        await this._conn.beginTransaction(mode);
        this.inTransaction = true;
        return this;
    }

    async _commitTransaction() {
        if (!(await this._checkDatabaseOpenPromise()) || !this.inTransaction) {
            return;
        }

        await this._conn.commit();
        this.inTransaction = false;
        return this;
    }

    async _rollbackTransaction() {
        if (!(await this._checkDatabaseOpenPromise()) || !this.inTransaction) {
            return;
        }

        await this._conn.rollback();
        this.inTransaction = false;
        return this;
    }

    async _finalizeTransactionEnd() {
        if (!this._closeOnEnd) {
            return this;
        }

        await this._dispose();
        return this;
    }

    _syncConnectionFunctions(conn) {
        for (const entry of this._state._customFunctions.values()) {
            const key = `${entry.name}:${entry.argc}`;

            if (conn._registeredFunctions.has(key)) {
                continue;
            }

            conn.createFunction(entry.name, entry.callback, entry.argc, entry.deterministic);
        }
    }

    async _getActiveConnection() {
        if (this._inSession) {
            this._syncConnectionFunctions(this._conn);

            return {
                conn: this._conn,
                pooled: false
            };
        }

        const conn = await this._acquireConnection();
        this._syncConnectionFunctions(conn);

        return {
            conn,
            pooled: true
        };
    }

    async _useConnection(callback) {
        if (!(await this._checkDatabaseOpenPromise())) {
            return null;
        }

        const { conn, pooled } = await this._getActiveConnection();

        try {
            const result = await callback(conn);

            if (pooled) {
                await this._releaseConnection(conn);
            }

            return result;
        } catch (err) {
            if (pooled) {
                await this._releaseConnection(conn);
            }

            throw err;
        }
    }

    _callConnection(method, ...args) {
        return this._useConnection(conn => conn[method](...args));
    }

    async _runSessionTransaction(callback, mode) {
        try {
            await this._beginTransaction(mode);
            const result = await callback(this);
            await this._commitTransaction();
            return result;
        } catch (err) {
            await this._rollbackTransaction().catch(_ => {});
            throw err;
        }
    }

    async _runNestedTransaction(callback) {
        const savepoint = this._conn.nextSavepointName();

        try {
            await this._conn.createSavepoint(savepoint);
            const result = await callback(this);
            await this._conn.releaseSavepoint(savepoint);
            return result;
        } catch (err) {
            await this._conn.rollbackToSavepoint(savepoint);
            await this._conn.releaseSavepoint(savepoint);
            throw err;
        }
    }

    async _runTransaction(callback, mode) {
        if (!this._inSession) {
            return await this._useManagedSession(session => session.transaction(callback, mode));
        }

        if (!this.inTransaction) {
            return await this._runSessionTransaction(callback, mode);
        }

        return await this._runNestedTransaction(callback);
    }

    _quoteIdentifier(name, label) {
        try {
            return DatabaseUtil.quoteIdentifier(name, label);
        } catch (err) {
            this._throwErrorSync(err);
            return null;
        }
    }

    _getMigrationSql(tableName) {
        return Object.fromEntries(
            Object.entries(SqliteDatabase.migrationSql).map(([name, sql]) => [
                name,
                RegexUtil.templateReplace(sql, { tableName })
            ])
        );
    }

    async _getMigrations(location) {
        const migrationLoader = new MigrationLoader(location, null),
            [migrations] = await migrationLoader.load();

        return migrations;
    }

    async _finalizeMigrationStatements(sts) {
        await Promise.all(
            Object.values(sts)
                .filter(Boolean)
                .map(st => st.finalize().catch(_ => {}))
        );
    }

    async _withMigrationStatements(tx, sql, callback) {
        const sts = {};

        try {
            sts.createTable = await tx.prepare(sql.createTable);
            await sts.createTable.run();

            sts.selectApplied = await tx.prepare(sql.selectApplied);
            sts.deleteApplied = await tx.prepare(sql.deleteApplied);
            sts.insertApplied = await tx.prepare(sql.insertApplied);

            return await callback(sts);
        } finally {
            await this._finalizeMigrationStatements(sts);
        }
    }

    async _rollbackMigration(tx, sts, migration) {
        return await tx.transactionImmediate(async nested => {
            if (migration.down) {
                await nested.exec(migration.down);
            }

            await sts.deleteApplied.run({
                $id: migration.id
            });
        });
    }

    async _rollbackMigrations(tx, sts, migrations, applied, force) {
        const lastMigration = migrations.at(-1),
            previous = Array.from(applied).sort((a, b) => b.id - a.id);

        for (const migration of previous) {
            const missingFromFiles = !migrations.some(candidate => candidate.id === migration.id),
                rollbackPastForce = Number.isInteger(force) && migration.id > force,
                rerunLast = force === "last" && migration.id === lastMigration.id;

            if (!missingFromFiles && !rollbackPastForce && !rerunLast) {
                break;
            }

            await this._rollbackMigration(tx, sts, migration);
            applied = applied.filter(item => item.id !== migration.id);
        }

        return applied;
    }

    async _applyMigration(tx, sts, migration) {
        return await tx.transactionImmediate(async nested => {
            if (migration.up) {
                await nested.exec(migration.up);
            }

            await sts.insertApplied.run({
                $id: migration.id,
                $name: migration.name,
                $up: migration.up,
                $down: migration.down
            });
        });
    }

    async _applyMigrations(tx, sts, migrations, applied, force, lastMigration) {
        const lastAppliedId = Util.empty(applied) ? 0 : applied.at(-1).id,
            maxMigrationId = Number.isInteger(force) ? force : lastMigration.id;

        for (const migration of migrations) {
            if (migration.id <= lastAppliedId || migration.id > maxMigrationId) {
                continue;
            }

            await this._applyMigration(tx, sts, migration);
        }
    }

    async _syncMigrations(tx, sts, migrations, appliedRows, force) {
        const lastMigration = migrations.at(-1),
            applied = await this._rollbackMigrations(tx, sts, migrations, Array.from(appliedRows), force);

        await this._applyMigrations(tx, sts, migrations, applied, force, lastMigration);
    }

    _checkDatabaseClosed(msg) {
        if (!this._open) {
            return true;
        }

        return new DatabaseError(msg ?? SqliteDatabase._dbOpenMsg);
    }

    _checkDatabaseClosedSync(msg) {
        return DatabaseUtil.checkSync(
            this,
            DatabaseEvents.promiseError,
            this.throwErrors,
            this._checkDatabaseClosed(msg)
        );
    }

    _checkSessionClosed() {
        if (!this._inSession) {
            return true;
        }

        return new DatabaseError("Cannot open a transaction session");
    }

    _checkSessionClosedSync() {
        return DatabaseUtil.checkSync(this, DatabaseEvents.promiseError, this.throwErrors, this._checkSessionClosed());
    }

    _checkDatabaseOpen(msg) {
        if (this._open) {
            return true;
        }

        const defaultMsg = this._inSession ? SqliteDatabase._sessionNotOpenMsg : SqliteDatabase._dbNotOpenMsg;
        return new DatabaseError(msg ?? defaultMsg);
    }

    _checkDatabaseOpenSync(msg) {
        return DatabaseUtil.checkSync(
            this,
            DatabaseEvents.promiseError,
            this.throwErrors,
            this._checkDatabaseOpen(msg)
        );
    }

    async _checkDatabaseOpenPromise(msg, resolveValue) {
        return await DatabaseUtil.checkPromise(
            this,
            DatabaseEvents.promiseError,
            this.throwErrors,
            this._checkDatabaseOpen(msg),
            resolveValue
        );
    }

    _throwErrorSync(err) {
        return DatabaseUtil.throwSync(this, DatabaseEvents.promiseError, this.throwErrors, err);
    }

    _throwErrorAsync(resolve, reject, err) {
        return DatabaseUtil.throwAsync(this, DatabaseEvents.promiseError, this.throwErrors, resolve, reject, err, this);
    }

    async _throwErrorPromise(err, resolveValue = this) {
        return await DatabaseUtil.throwPromise(this, DatabaseEvents.promiseError, this.throwErrors, err, resolveValue);
    }
}

export default SqliteDatabase;
