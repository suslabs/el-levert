import SqliteDatabase from "./drivers/sqlite/SqliteDatabase.js";
import QueryLoader from "../loaders/query/QueryLoader.js";

import OpenModes from "./drivers/sqlite/OpenModes.js";
import LoadStatus from "../loaders/LoadStatus.js";

import TypeTester from "../util/TypeTester.js";

class SqlDatabase {
    constructor(dbPath, queryPath, options) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        options = TypeTester.isObject(options) ? options : {};
        this.options = options;

        this._setOptions(options);

        this.db = null;
        this._queryLoader = null;
    }

    async open(mode) {
        const dbConfig = {
            enableWALMode: this.enableWAL,

            min: this.poolMin,
            max: this.poolMax,

            acquireTimeout: this.acquireTimeout,
            busyTimeout: this.busyTimeout,
            delayRelease: this.delayRelease,

            loadExtensions: this.loadExtensions,
            transactionMode: this.transactionMode
        };

        const db = this.db ?? new SqliteDatabase(this.dbPath, mode, dbConfig);

        try {
            await db.open();
        } catch (err) {
            if (err.message !== "Cannot open database. The database is open") {
                throw err;
            }
        }

        this.db = db;
    }

    async create() {
        await this.open(OpenModes.OPEN_RWCREATE);
        await this._loadCreateQueries();

        for (const query of this._queryLoader.createQueries) {
            await this.db.run(query);
        }
    }

    async load() {
        await this.open(OpenModes.OPEN_READWRITE);
        return await this._loadDatabase();
    }

    async migrate(options) {
        await this.open(OpenModes.OPEN_RWCREATE);
        return this.db.migrate(options);
    }

    async beginTransaction(mode) {
        const trxDb = await this.db.beginTransaction(mode);
        return await this._createScopedDatabase(trxDb);
    }

    commit() {
        return this.db.commit();
    }

    rollback() {
        return this.db.rollback();
    }

    transaction(callback, mode) {
        return this.db.transaction(async trxDb => {
            const trx = await this._createScopedDatabase(trxDb);

            try {
                return await callback(trx);
            } finally {
                await trx._unloadDatabase();
            }
        }, mode);
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

    async close() {
        await this._unloadDatabase();
        await this.db.close();
        this.db = null;
    }

    _setOptions(options) {
        this.logger = options.logger ?? null;

        this.queryExtension = options.queryExtension ?? ".sql";
        this.queryEncoding = options.queryEncoding ?? "utf8";

        this.enableWAL = options.enableWAL ?? true;

        this.poolMin = options.poolMin ?? 1;
        this.poolMax = options.poolMax ?? 4;

        this.acquireTimeout = options.acquireTimeout ?? 1000;
        this.busyTimeout = options.busyTimeout;
        this.delayRelease = options.delayRelease ?? false;

        this.loadExtensions = new Set(options.loadExtensions ?? []);
        this.transactionMode = options.transactionMode ?? "immediate";

        this.rewriteFunc = typeof options.rewriteQueryStrings === "function" ? options.rewriteQueryStrings : undefined;
    }

    _getQueryLoaderOptions(options) {
        return {
            fileExtension: this.queryExtension,
            encoding: this.queryEncoding,
            ...options
        };
    }

    _setQueryLoaderOptions(queryLoader, options) {
        queryLoader.db = options.db ?? queryLoader.db;
        queryLoader.rewriteFunc = options.rewriteQueryStrings ?? queryLoader.rewriteFunc;
        queryLoader.loadCreate = options.loadCreate ?? queryLoader.loadCreate;
        queryLoader.loadQueries = options.loadQueries ?? queryLoader.loadQueries;
    }

    async _loadCreateQueries() {
        const queryLoader =
            this._queryLoader ??
            new QueryLoader(
                this.queryPath,
                this.logger,
                this._getQueryLoaderOptions({
                    loadCreate: true,
                    loadQueries: false
                })
            );

        if (this._queryLoader !== null) {
            this._setQueryLoaderOptions(queryLoader, {
                loadCreate: true,
                loadQueries: false
            });
        }

        this._queryLoader = queryLoader;
        const [, status] = await queryLoader.load();

        if (status === LoadStatus.failed) {
            return null;
        }

        return queryLoader.result;
    }

    _assignQueries(queries) {
        Object.assign(this, queries);
    }

    async _loadDatabase() {
        const queryLoader =
            this._queryLoader ??
            new QueryLoader(
                this.queryPath,
                this.logger,
                this._getQueryLoaderOptions({
                    db: this.db,
                    rewriteQueryStrings: this.rewriteFunc,
                    loadCreate: false,
                    loadQueries: true
                })
            );

        if (this._queryLoader !== null) {
            this._setQueryLoaderOptions(queryLoader, {
                db: this.db,
                rewriteQueryStrings: this.rewriteFunc,
                loadCreate: false,
                loadQueries: true
            });
        }

        this._queryLoader = queryLoader;
        const [queries, status] = await queryLoader.load();

        if (status === LoadStatus.failed) {
            return null;
        }

        this._assignQueries(queries);
        return queryLoader.result;
    }

    _copyScopedOverrides(scoped) {
        for (const key of Object.keys(this)) {
            const value = this[key];

            if (typeof value === "function") {
                scoped[key] = value;
            }
        }
    }

    async _createScopedDatabase(db) {
        const scoped = new this.constructor(this.dbPath, this.queryPath, this.options);

        this._copyScopedOverrides(scoped);

        scoped.db = db;
        await scoped._loadDatabase();

        return scoped;
    }

    _deleteLoadedQueries() {
        if (!TypeTester.isObject(this._queryLoader?.queries)) {
            return;
        }

        for (const category of Object.keys(this._queryLoader.queries)) {
            delete this[category];
        }
    }

    async _unloadDatabase() {
        if (!this._queryLoader?.loaded) {
            this._queryLoader = null;
            return;
        }

        this._deleteLoadedQueries();
        await this._queryLoader.deleteQueries();

        this._queryLoader = null;
    }
}

export default SqlDatabase;
