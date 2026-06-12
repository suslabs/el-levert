import EventEmitter from "node:events";

import genericPool from "generic-pool";

import SqlitePoolConnection from "./SqlitePoolConnection.js";

import { PoolEvents } from "./PoolEvents.js";

import ObjectUtil from "../../../util/ObjectUtil.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

class SqlitePool extends EventEmitter {
    constructor(config) {
        super();

        config = ObjectUtil.guaranteeObject(config);
        this.config = config;

        this._setConfig(config);

        this.connections = new Set();
        this._createPool();
    }

    applyConfig(config) {
        config = ObjectUtil.guaranteeObject(config);

        this._setConfig(config);
        this._setOptions();

        for (const conn of this.connections) {
            conn._setConfig(this._getConnectionConfig());
        }
    }

    async acquire() {
        try {
            const conn = await this.pool.acquire();
            conn._released = false;
            this.emit(PoolEvents.acquire, conn);
            return conn;
        } catch (err) {
            return await DatabaseUtil.throwPromise(this, PoolEvents.promiseError, this.throwErrors, err);
        }
    }

    releaseConnection(connection) {
        this.emit(PoolEvents.release, connection);
        return this.pool.release(connection);
    }

    destroyConnection(connection) {
        this.emit(PoolEvents.destroy, connection);
        return this.pool.destroy(connection);
    }

    async empty() {
        await this.pool.drain();
        this.emit(PoolEvents.drain);

        await this.pool.clear();
        this.emit(PoolEvents.clear);
    }

    createFunction(name, callback, argc = -1, deterministic = false) {
        const key = `${name}:${argc}`;

        this.customFunctions.set(key, {
            name,
            callback,
            argc,
            deterministic
        });

        this.config.customFunctions = this.customFunctions;

        for (const conn of this.connections) {
            conn._setConfig(this._getConnectionConfig());
            conn.createFunction(name, callback, argc, deterministic);
        }
    }

    defaultSafeIntegers(enabled = true) {
        this.safeIntegers = enabled;
        this.config.safeIntegers = enabled;

        for (const conn of this.connections) {
            conn._setConfig(this._getConnectionConfig());
            conn.defaultSafeIntegers(enabled);
        }
    }

    _setConfig(config) {
        this.filename = config.filename ?? this.filename ?? "";
        this.mode = config.mode ?? this.mode;
        this.eventPrefix = config.eventPrefix ?? this.eventPrefix;

        this.enableWALMode = config.enableWALMode ?? this.enableWALMode ?? false;

        this.min = config.min ?? this.min ?? 1;
        this.max = config.max ?? this.max ?? 4;

        this.acquireTimeout = config.acquireTimeout ?? config.acquireTimeoutMillis ?? this.acquireTimeout ?? 1000;
        this.busyTimeout = config.busyTimeout ?? this.busyTimeout ?? null;
        this.delayRelease = config.delayRelease ?? this.delayRelease ?? false;

        this.loadExtensions = new Set(config.loadExtensions ?? this.loadExtensions ?? []);
        this.customFunctions = new Map(config.customFunctions ?? this.customFunctions ?? []);

        this.safeIntegers = config.safeIntegers ?? this.safeIntegers ?? false;
        this.transactionMode = config.transactionMode ?? this.transactionMode ?? "immediate";

        this.verbose = config.verbose ?? this.verbose ?? false;
        this.throwErrors = config.throwErrors ?? this.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? this.autoRollback ?? false;
    }

    _setOptions() {
        const isEphemeral = this.filename === ":memory:" || this.filename === "";

        const min = isEphemeral ? 1 : Math.max(1, this.min),
            max = isEphemeral ? 1 : Math.max(min, this.max);

        this.options = {
            min,
            max,
            acquireTimeoutMillis: this.acquireTimeout
        };
    }

    _getConnectionConfig() {
        return {
            ...this.config,

            enableWALMode: this.enableWALMode,

            min: this.min,
            max: this.max,

            acquireTimeout: this.acquireTimeout,
            busyTimeout: this.busyTimeout,
            delayRelease: this.delayRelease,

            loadExtensions: this.loadExtensions,
            customFunctions: this.customFunctions,
            safeIntegers: this.safeIntegers,
            transactionMode: this.transactionMode,

            verbose: this.verbose,
            throwErrors: this.throwErrors,
            autoRollback: this.autoRollback,

            filename: this.filename,
            mode: this.mode,
            eventPrefix: this.eventPrefix
        };
    }

    _createPoolFactory() {
        return {
            create: async () => {
                const conn = new SqlitePoolConnection(this);
                await conn.open();
                this.connections.add(conn);
                return conn;
            },

            destroy: async conn => {
                this.connections.delete(conn);
                await conn.close();
            },

            validate: conn => {
                return conn.db !== null;
            }
        };
    }

    _createPool() {
        this._setOptions();
        this.pool = genericPool.createPool(this._createPoolFactory(), this.options);

        this.pool.on(PoolEvents.factoryCreateError, err => this.emit(PoolEvents.factoryCreateError, err));
        this.pool.on(PoolEvents.factoryDestroyError, err => this.emit(PoolEvents.factoryDestroyError, err));
    }
}

export default SqlitePool;
