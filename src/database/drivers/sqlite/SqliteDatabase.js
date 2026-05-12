import path from "node:path";
import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import SqlitePool from "./SqlitePool.js";
import SqliteStatement from "./SqliteStatement.js";

import MigrationLoader from "../../../loaders/migration/MigrationLoader.js";

import PoolEvents from "./PoolEvents.js";
import ConnectionEvents from "./ConnectionEvents.js";
import EventPrefixes from "./EventPrefixes.js";
import DatabaseEvents from "./DatabaseEvents.js";
import OpenModes from "./OpenModes.js";

import TypeTester from "../../../util/TypeTester.js";
import Util from "../../../util/Util.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqliteDatabase extends StatementDatabase(EventEmitter) {
    constructor(filename, mode, config, session) {
        super();

        this.filename = filename;
        this.mode = mode ?? OpenModes.OPEN_RWCREATE;

        config = TypeTester.isObject(config) ? config : {};
        this.config = config;
        this.options = {};

        this._setConfig(config);

        this.pool = null;
        this.db = null;
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
        return new Promise((resolve, reject) => {
            if (!this._checkSessionClosedAsync(resolve, reject)) {
                return;
            }

            if (
                !this._checkDatabaseClosedAsync(resolve, reject, `Cannot open database. ${SqliteDatabase._dbOpenMsg}`)
            ) {
                return;
            }

            const pool = new SqlitePool(this._getPoolConfig());

            DatabaseUtil.registerPrefixedEvents(pool, this, EventPrefixes.pool, PoolEvents);

            this.pool = pool;
            this.db = pool;

            resolve(this);
        });
    }

    close() {
        if (this._isSession()) {
            return this._dispose();
        }

        return new Promise((resolve, reject) => {
            if (
                !this._checkDatabaseOpenAsync(resolve, reject, `Cannot close database. ${SqliteDatabase._dbNotOpenMsg}`)
            ) {
                return;
            }

            this.finalizeAll()
                .then(_ => this.pool.close())
                .then(_ => {
                    DatabaseUtil.removePrefixedEvents(this.pool, this, EventPrefixes.pool, PoolEvents);

                    this.pool = null;
                    this.db = null;

                    resolve();
                })
                .catch(reject);
        });
    }

    configure(...args) {
        if (!this._checkDatabaseOpenSync()) {
            return;
        }

        if (this._isSession()) {
            this._conn.configure(...args);
        } else {
            for (const conn of this.pool.connections) {
                conn.configure(...args);
            }
        }

        if (args[0] === "busyTimeout") {
            this._setBusyTimeout(args[1]);
            this._applyConfig({ busyTimeout: args[1] });
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
        if (this._isSession()) {
            return Promise.resolve(callback(this));
        }

        return this._useManagedSession(callback);
    }

    prepare(sql, ...param) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            this._prepareStatement(sql, param).then(resolve).catch(reject);
        });
    }

    beginTransaction(mode = this.transactionMode) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            this._beginTransaction(mode).then(resolve).catch(reject);
        });
    }

    commit() {
        if (!this._isSession()) {
            return this._rejectRootTransactionMethod(
                "Cannot commit the pooled root database. Commit the session instead."
            );
        }

        return this._commitTransaction().then(_ => this._finalizeTransactionEnd());
    }

    rollback() {
        if (!this._isSession()) {
            return this._rejectRootTransactionMethod(
                "Cannot roll back the pooled root database. Roll back the session instead."
            );
        }

        return this._rollbackTransaction().then(_ => this._finalizeTransactionEnd());
    }

    transaction(callback, mode = this.transactionMode) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            this._runTransaction(callback, mode).then(resolve).catch(reject);
        });
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

    loadExtension(extensionPath) {
        return new Promise((resolve, reject) => {
            const resolved = path.resolve(extensionPath);
            this._addExtensionPath(resolved);

            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                resolve(this);
                return;
            }

            this._applyConfig({
                loadExtensions: this._getExtensionPaths()
            });

            this._useConnection(conn => conn.loadExtension(resolved))
                .then(_ => resolve(this))
                .catch(reject);
        });
    }

    pragma(pragma, options) {
        return this._callConnection("pragma", pragma, options);
    }

    enableWALMode() {
        return this._useConnection(conn => conn.enableWALMode()).then(_ => {
            this._setWALMode(true);
            this._applyConfig({
                enableWALMode: true
            });

            return this;
        });
    }

    disableWALMode() {
        return this._useConnection(conn => conn.disableWALMode()).then(_ => {
            this._setWALMode(false);
            this._applyConfig({
                enableWALMode: false
            });

            return this;
        });
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

    vacuum() {
        return this._callConnection("vacuum").then(_ => this);
    }

    backup(destination, options) {
        return this._callConnection("backup", destination, options);
    }

    migrate({ force, table = "migrations", migrationsPath = "./migrations" } = {}) {
        const tableName = DatabaseUtil.quoteIdentifier(table, "Migration table name"),
            sql = this._getMigrationSql(tableName),
            location = path.resolve(migrationsPath);

        return this._getMigrations(location)
            .then(migrations => {
                return this.transactionImmediate(trx => {
                    return this._withMigrationStatements(trx, sql, sts => {
                        return sts.selectApplied
                            .all()
                            .then(appliedRows => this._syncMigrations(trx, sts, migrations, appliedRows, force));
                    });
                });
            })
            .then(_ => this);
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
        this.transactionMode = root.transactionMode;
    }

    _setOptions(options) {
        this._closeOnEnd = options.closeOnEnd ?? false;
    }

    _registerConnection(conn, target) {
        let listeners = this._connectionListeners.get(conn);

        if (listeners == null) {
            listeners = new Map();
            this._connectionListeners.set(conn, listeners);
        }

        const prefixedListeners = new Map();

        for (const event of Object.values(ConnectionEvents)) {
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
        this.db = conn;
        this._conn = conn;
        this.inTransaction = conn.inTransaction;

        this._root._registerConnection(conn, this);
    }

    _releaseConnection(conn, target = this) {
        const release = () => {
            const listeners = this._connectionListeners.get(conn);
            const targetListeners = listeners.get(target);

            for (const [event, listener] of targetListeners.prefixedListeners) {
                conn.removeListener(event, listener);
            }

            conn.removeListener(ConnectionEvents.promiseError, targetListeners.promiseErrorListener);
            listeners.delete(target);

            if (listeners.size === 0) {
                this._connectionListeners.delete(conn);
            }

            conn.release();
        };

        if (this.delayRelease) {
            return new Promise(resolve => {
                setImmediate(() => {
                    release();
                    resolve();
                });
            });
        }

        release();
        return Promise.resolve();
    }

    _dispose() {
        if (!this._isSession() || this._released) {
            return Promise.resolve();
        }

        this._released = true;

        return this.finalizeAll()
            .catch(_ => {})
            .then(_ => {
                if (this._conn.inTransaction) {
                    return this._conn.rollback().catch(_ => {});
                }
            })
            .then(_ => {
                this._conn.removeListener(ConnectionEvents.autoRollback, this._autoRollbackListener);
                this._autoRollbackListener = null;

                return this._root._releaseConnection(this._conn, this).then(_ => {
                    this.db = null;
                    this._conn = null;
                    this.inTransaction = false;
                });
            });
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
        this.options = TypeTester.isObject(options) ? options : {};

        this._setRoot(root);
        this._syncRootState(root);

        this._setOptions(this.options);

        this._setConnection(conn);

        this._setAutoRollbackHandler();
    }

    _checkDatabaseClosed(msg) {
        if (!this._isDatabaseOpen()) {
            return true;
        }

        return new DatabaseError(msg ?? SqliteDatabase._dbOpenMsg);
    }

    _checkDatabaseClosedAsync(resolve, reject, msg) {
        return DatabaseUtil.checkAsync(
            this,
            DatabaseEvents.promiseError,
            this.throwErrors,
            resolve,
            reject,
            this._checkDatabaseClosed(msg)
        );
    }

    _isSession() {
        return this._root != null;
    }

    _isDatabaseOpen() {
        if (this._isSession()) {
            return this._conn != null && !this._released && this._conn.db != null;
        }

        return this.pool !== null;
    }

    _checkSessionClosedAsync(resolve, reject) {
        if (!this._isSession()) {
            return true;
        }

        const err = new DatabaseError("Cannot open a transaction session");
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            reject(err);
        } else {
            resolve();
        }

        return false;
    }

    _checkDatabaseOpen(msg) {
        if (this._isDatabaseOpen()) {
            return true;
        }

        const defaultMsg = this._isSession() ? SqliteDatabase._sessionNotOpenMsg : SqliteDatabase._dbNotOpenMsg;
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

    _checkDatabaseOpenAsync(resolve, reject, msg) {
        return DatabaseUtil.checkAsync(
            this,
            DatabaseEvents.promiseError,
            this.throwErrors,
            resolve,
            reject,
            this._checkDatabaseOpen(msg)
        );
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
            transactionMode: this.transactionMode,

            verbose: this.verbose,
            throwErrors: this.throwErrors,
            autoRollback: this.autoRollback,

            filename: this.filename,
            mode: this.mode,
            eventPrefix: EventPrefixes.connection
        };
    }

    _getStateTarget() {
        return this._root ?? this;
    }

    _applyConfig(config) {
        this._getStateTarget().pool.applyConfig(config);
    }

    _addExtensionPath(resolved) {
        this._getStateTarget()._extensionPaths.add(resolved);
    }

    _getExtensionPaths() {
        return this._getStateTarget()._extensionPaths;
    }

    _setWALMode(enabled) {
        this.WALMode = enabled;
        this._getStateTarget().WALMode = enabled;
    }

    _setBusyTimeout(value) {
        this.busyTimeout = value;
        this._getStateTarget().busyTimeout = value;
    }

    _getInterruptConnections() {
        return this._isSession() ? [this._conn] : this.pool.connections;
    }

    _ownStatement(st) {
        st._owner = this;
        this.addStatement(st);
        return st;
    }

    _createStatement(sql, param) {
        return this._ownStatement(new SqliteStatement(this, sql, param));
    }

    _prepareStatement(sql, param) {
        if (!this._isSession()) {
            return Promise.resolve(this._createStatement(sql, param));
        }

        return this._conn.prepare(sql, ...param).then(st => this._ownStatement(st));
    }

    _acquireConnection() {
        return this.pool.acquire().then(conn => {
            this._registerConnection(conn, this);
            return conn;
        });
    }

    _createSession(options = {}) {
        return this.pool.acquire().then(conn => {
            return new SqliteDatabase(this.filename, this.mode, this.config, {
                root: this,
                conn,
                options
            });
        });
    }

    _useManagedSession(callback, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            this._createSession(options)
                .then(session => {
                    Promise.resolve(callback(session))
                        .then(resolve)
                        .catch(reject)
                        .finally(() => {
                            session.close().catch(_ => {});
                        });
                })
                .catch(reject);
        });
    }

    _beginTransaction(mode) {
        if (!this._isSession()) {
            return this._createSession({
                closeOnEnd: true
            }).then(session => session.beginTransaction(mode));
        }

        if (this.inTransaction) {
            return Promise.resolve(this);
        }

        return this._conn.beginTransaction(mode).then(_ => {
            this.inTransaction = true;
            return this;
        });
    }

    _getActiveConnection() {
        if (this._isSession()) {
            return Promise.resolve({
                conn: this._conn,
                pooled: false
            });
        }

        return this._acquireConnection().then(conn => ({
            conn,
            pooled: true
        }));
    }

    _useConnection(callback) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            this._getActiveConnection()
                .then(async ({ conn, pooled }) => {
                    try {
                        const result = await callback(conn);

                        if (pooled) {
                            await this._releaseConnection(conn);
                        }

                        resolve(result);
                    } catch (err) {
                        if (pooled) {
                            await this._releaseConnection(conn);
                        }

                        reject(err);
                    }
                })
                .catch(reject);
        });
    }

    _callConnection(method, ...args) {
        return this._useConnection(conn => conn[method](...args));
    }

    _runTransaction(callback, mode) {
        if (!this._isSession()) {
            return this._useManagedSession(session => session.transaction(callback, mode));
        }

        if (!this.inTransaction) {
            return this._runSessionTransaction(callback, mode);
        }

        return this._runNestedTransaction(callback);
    }

    _runSessionTransaction(callback, mode) {
        return this._beginTransaction(mode)
            .then(_ => Promise.resolve(callback(this)))
            .then(result => {
                return this._commitTransaction().then(_ => result);
            })
            .catch(err => {
                return this._rollbackTransaction()
                    .catch(_ => {})
                    .then(_ => {
                        throw err;
                    });
            });
    }

    _runNestedTransaction(callback) {
        const savepoint = this._conn.nextSavepointName();

        return this._conn
            .createSavepoint(savepoint)
            .then(_ => Promise.resolve(callback(this)))
            .then(result => {
                return this._conn.releaseSavepoint(savepoint).then(_ => result);
            })
            .catch(err => {
                return this._conn
                    .rollbackToSavepoint(savepoint)
                    .then(_ => this._conn.releaseSavepoint(savepoint))
                    .then(_ => {
                        throw err;
                    });
            });
    }

    _commitTransaction() {
        if (!this._checkDatabaseOpenSync() || !this.inTransaction) {
            return Promise.resolve();
        }

        return this._conn.commit().then(_ => {
            this.inTransaction = false;
            return this;
        });
    }

    _rollbackTransaction() {
        if (!this._checkDatabaseOpenSync() || !this.inTransaction) {
            return Promise.resolve();
        }

        return this._conn.rollback().then(_ => {
            this.inTransaction = false;
            return this;
        });
    }

    _finalizeTransactionEnd() {
        if (!this._closeOnEnd) {
            return Promise.resolve(this);
        }

        return this._dispose().then(_ => this);
    }

    _getMigrationSql(tableName) {
        return {
            createTable:
                "CREATE TABLE IF NOT EXISTS " +
                tableName +
                " (id INTEGER PRIMARY KEY, name TEXT NOT NULL, up TEXT NOT NULL, down TEXT NOT NULL)",
            selectApplied: "SELECT id, name, up, down FROM " + tableName + " ORDER BY id ASC",
            deleteApplied: "DELETE FROM " + tableName + " WHERE id = ?",
            insertApplied: "INSERT INTO " + tableName + " (id, name, up, down) VALUES (?, ?, ?, ?)"
        };
    }

    async _getMigrations(location) {
        const migrationLoader = new MigrationLoader(location, null),
            [migrations] = await migrationLoader.load();

        return migrations;
    }

    _finalizeMigrationStatements(sts) {
        return Promise.all(
            Object.values(sts)
                .filter(Boolean)
                .map(st => st.finalize().catch(_ => {}))
        );
    }

    _withMigrationStatements(trx, sql, callback) {
        const sts = {};

        return trx
            .prepare(sql.createTable)
            .then(st => {
                sts.createTable = st;
                return sts.createTable.run();
            })
            .then(_ => {
                return trx.prepare(sql.selectApplied);
            })
            .then(st => {
                sts.selectApplied = st;
                return trx.prepare(sql.deleteApplied);
            })
            .then(st => {
                sts.deleteApplied = st;
                return trx.prepare(sql.insertApplied);
            })
            .then(st => {
                sts.insertApplied = st;
                return callback(sts);
            })
            .finally(() => {
                return this._finalizeMigrationStatements(sts);
            });
    }

    _rollbackMigration(trx, sts, migration) {
        return trx.transactionImmediate(nested => {
            const rollbackPromise = migration.down ? nested.exec(migration.down) : Promise.resolve();
            return rollbackPromise.then(_ => sts.deleteApplied.run(migration.id));
        });
    }

    _rollbackMigrations(trx, sts, migrations, applied, force) {
        const lastMigration = migrations.at(-1),
            previous = Array.from(applied).sort((a, b) => b.id - a.id);

        let chain = Promise.resolve();

        for (const migration of previous) {
            const missingFromFiles = !migrations.some(candidate => candidate.id === migration.id),
                rollbackPastForce = Number.isInteger(force) && migration.id > force,
                rerunLast = force === "last" && migration.id === lastMigration.id;

            if (!missingFromFiles && !rollbackPastForce && !rerunLast) {
                break;
            }

            chain = chain.then(_ => this._rollbackMigration(trx, sts, migration));
            applied = applied.filter(item => item.id !== migration.id);
        }

        return chain.then(_ => applied);
    }

    _applyMigration(trx, sts, migration) {
        return trx.transactionImmediate(nested => {
            const applyPromise = migration.up ? nested.exec(migration.up) : Promise.resolve();

            return applyPromise.then(_ =>
                sts.insertApplied.run(migration.id, migration.name, migration.up, migration.down)
            );
        });
    }

    _applyMigrations(trx, sts, migrations, applied, force, lastMigration) {
        const lastAppliedId = Util.empty(applied) ? 0 : applied.at(-1).id,
            maxMigrationId = Number.isInteger(force) ? force : lastMigration.id;

        let chain = Promise.resolve();

        for (const migration of migrations) {
            if (migration.id <= lastAppliedId || migration.id > maxMigrationId) {
                continue;
            }

            chain = chain.then(_ => this._applyMigration(trx, sts, migration));
        }

        return chain;
    }

    _syncMigrations(trx, sts, migrations, appliedRows, force) {
        let applied = Array.from(appliedRows);

        const lastMigration = migrations.at(-1);

        return this._rollbackMigrations(trx, sts, migrations, applied, force).then(nextApplied => {
            applied = nextApplied;
            return this._applyMigrations(trx, sts, migrations, applied, force, lastMigration);
        });
    }

    _errorRollbackAsync(resolve, reject, err) {
        if (!err) {
            return false;
        }

        err = DatabaseUtil.wrapError(err);
        this.emit(DatabaseEvents.promiseError, err);

        if (this.throwErrors) {
            reject(err);
        } else {
            resolve();
        }

        return true;
    }

    _throwErrorSync(err) {
        return DatabaseUtil.throwSync(this, DatabaseEvents.promiseError, this.throwErrors, err);
    }

    _throwErrorAsync(resolve, reject, err) {
        return DatabaseUtil.throwAsync(this, DatabaseEvents.promiseError, this.throwErrors, resolve, reject, err, this);
    }

    _rejectRootTransactionMethod(msg) {
        return new Promise((resolve, reject) => {
            if (!this._checkDatabaseOpenAsync(resolve, reject)) {
                return;
            }

            const err = new DatabaseError(msg);
            this.emit(DatabaseEvents.promiseError, err);
            reject(err);
        });
    }
}

export default SqliteDatabase;
