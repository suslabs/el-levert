import EventEmitter from "node:events";

import genericPool from "generic-pool";

import SqlitePoolConnection from "./SqlitePoolConnection.js";

import PoolEvents from "./PoolEvents.js";

import TypeTester from "../../../util/TypeTester.js";

import DatabaseError from "../../../errors/DatabaseError.js";

class SqlitePool extends EventEmitter {
    constructor(config) {
        super();

        config = TypeTester.isObject(config) ? config : {};
        this.config = config;

        this._setConfig(config);

        this.connections = new Set();
        this._createPool();
    }

    applyConfig(config) {
        config = TypeTester.isObject(config) ? config : {};

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
            const wrapped = err instanceof DatabaseError ? err : new DatabaseError(err);
            this.emit(PoolEvents.promiseError, wrapped);

            if (this.throwErrors) {
                throw wrapped;
            }
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

    async close() {
        await this.pool.drain();
        this.emit(PoolEvents.drain);

        await this.pool.clear();
        this.emit(PoolEvents.clear);
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

        this.throwErrors = config.throwErrors ?? this.throwErrors ?? true;
        this.autoRollback = config.autoRollback ?? this.autoRollback ?? false;
        this.verbose = config.verbose ?? this.verbose ?? false;

        this.loadExtensions = new Set(config.loadExtensions ?? this.loadExtensions ?? []);
        this.transactionMode = config.transactionMode ?? this.transactionMode ?? "immediate";
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
            transactionMode: this.transactionMode,

            filename: this.filename,
            mode: this.mode,
            eventPrefix: this.eventPrefix,

            throwErrors: this.throwErrors,
            autoRollback: this.autoRollback,
            verbose: this.verbose,
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
                return conn.db != null;
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
