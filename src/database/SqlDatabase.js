import SqliteDatabase from "./drivers/sqlite/SqliteDatabase.js";

import QueryLoader from "../loaders/query/QueryLoader.js";
import MigrationLoader from "../loaders/migration/MigrationLoader.js";

import { OpenModes } from "./drivers/sqlite/OpenModes.js";
import { LoadStatus } from "../loaders/LoadStatus.js";

import ObjectUtil from "../util/ObjectUtil.js";

class SqlDatabase {
    static migrationSeedSql = Object.freeze({
        createTable:
            "CREATE TABLE IF NOT EXISTS migrations " +
            "(id INTEGER PRIMARY KEY, name TEXT NOT NULL, up TEXT NOT NULL, down TEXT NOT NULL);",
        selectIds: "SELECT id FROM migrations;",
        insertApplied: "INSERT INTO migrations (id, name, up, down) VALUES ($id, $name, $up, $down);"
    });

    constructor(dbPath, queryPath, options) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this._setOptions(options);

        this.db = null;
        this._queryLoader = null;
        this._queryRoot = null;
        this._migrations = new Map();
        this._loadedCategories = new Set();

        this._childSetup = this.setup;
        this.setup = this._setup.bind(this);
    }

    async open(mode) {
        if (this.db !== null) {
            return;
        }

        const dbConfig = {
                enableWALMode: this.enableWAL,

                min: this.poolMin,
                max: this.poolMax,

                acquireTimeout: this.acquireTimeout,
                busyTimeout: this.busyTimeout,
                delayRelease: this.delayRelease,

                loadExtensions: this.loadExtensions,
                customFunctions: this.customFunctions,
                transactionMode: this.transactionMode
            },
            db = new SqliteDatabase(this.dbPath, mode, dbConfig);

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
        await this.setup("create");
        await this._loadCreateQueries();

        for (const query of this._queryLoader.createQueries) {
            await this.db.run(query);
        }
    }

    async load() {
        await this.open(OpenModes.OPEN_READWRITE);
        await this.setup("load");
        return await this._loadDatabase();
    }

    async prepare(sql, ...param) {
        return await this.db.prepare(sql, ...param);
    }

    async setup() {}

    async reload() {
        await this._unloadDatabase();
        return await this._loadDatabase();
    }

    async migrate(options) {
        await this.open(OpenModes.OPEN_RWCREATE);
        return this.db.migrate(options);
    }

    async vacuum() {
        await this._unloadDatabase();
        await this.db.vacuum();
        return await this._loadDatabase();
    }

    async beginTransaction(mode) {
        const txDb = await this.db.beginTransaction(mode);
        return await this._createScopedDatabase(txDb);
    }

    async commit() {
        const res = await this.db.commit();

        if (this._queryRoot !== null) {
            this._unloadScopedDatabase();
        }

        return res;
    }

    async rollback() {
        const res = await this.db.rollback();

        if (this._queryRoot !== null) {
            this._unloadScopedDatabase();
        }

        return res;
    }

    transaction(callback, mode) {
        return this.db.transaction(async txDb => {
            const tx = await this._createScopedDatabase(txDb);

            try {
                return await callback(tx);
            } finally {
                tx._unloadScopedDatabase();
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
        if (this._queryRoot !== null) {
            this._unloadScopedDatabase();

            if (this.db !== null) {
                await this.db.close();
            }

            this.db = null;
            return;
        }

        await this._unloadDatabase();
        await this.db.close();
        this.db = null;
    }

    _setOptions(options) {
        this.logger = options.logger ?? null;

        this.queryExtension = options.queryExtension ?? ".sql";
        this.queryEncoding = options.queryEncoding ?? "utf8";

        this.migrationsPath = options.migrationsPath;

        this.enableWAL = options.enableWAL ?? true;

        this.poolMin = options.poolMin ?? 1;
        this.poolMax = options.poolMax ?? 4;

        this.acquireTimeout = options.acquireTimeout ?? 1000;
        this.busyTimeout = options.busyTimeout;
        this.delayRelease = options.delayRelease ?? false;

        this.loadExtensions = new Set(options.loadExtensions ?? []);
        this.customFunctions = new Map(options.customFunctions ?? []);
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
        this._deleteLoadedQueries();

        for (const [category, value] of Object.entries(queries)) {
            this[category] = value;
            this._loadedCategories.add(category);
        }
    }

    async _loadDatabase() {
        if (this._queryRoot !== null) {
            return await this._loadScopedDatabase();
        }

        const queryLoader =
            this._queryLoader ??
            new QueryLoader(
                this.queryPath,
                this.logger,
                this._getQueryLoaderOptions({
                    db: this,
                    rewriteQueryStrings: this.rewriteFunc,
                    loadCreate: false,
                    loadQueries: true
                })
            );

        if (this._queryLoader !== null) {
            this._setQueryLoaderOptions(queryLoader, {
                db: this,
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

    async _loadScopedDatabase() {
        const root = this._queryRoot;

        if (!root?._queryLoader?.loaded) {
            return null;
        }

        const queries = {};

        for (const [categoryName, categoryQueries] of Object.entries(root._queryLoader.queries)) {
            const scopedQueries = {};

            for (const [queryName, st] of Object.entries(categoryQueries)) {
                scopedQueries[queryName] = await this.db.bindStatement(st);
            }

            queries[categoryName] = scopedQueries;
        }

        this._assignQueries(queries);
        return queries;
    }

    async _setup(...args) {
        if (typeof this._childSetup === "function") {
            return await this._childSetup.apply(this, args);
        }
    }

    async _loadMigrations(migrationsPath = this.migrationsPath) {
        const resolvedPath = String(migrationsPath ?? "");

        if (!this._migrations.has(resolvedPath)) {
            const loader = new MigrationLoader(resolvedPath, null),
                [migrations] = await loader.load();

            this._migrations.set(resolvedPath, migrations);
        }

        return this._migrations.get(resolvedPath);
    }

    async _seedAppliedMigrations(ids, migrationsPath = this.migrationsPath) {
        const migrations = await this._loadMigrations(migrationsPath),
            existing = new Set();

        await this.db.run(SqlDatabase.migrationSeedSql.createTable);

        const rows = await this.db.all(SqlDatabase.migrationSeedSql.selectIds);

        for (const row of Array.from(rows)) {
            existing.add(row.id);
        }

        for (const migration of migrations) {
            if (!ids.includes(migration.id) || existing.has(migration.id)) {
                continue;
            }

            await this.db.run(SqlDatabase.migrationSeedSql.insertApplied, {
                $id: migration.id,
                $name: migration.name,
                $up: migration.up,
                $down: migration.down
            });
        }
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
        scoped._queryRoot = this._getQueryRoot();

        await scoped._loadDatabase();

        return scoped;
    }

    _getQueryRoot() {
        return this._queryRoot ?? this;
    }

    _deleteLoadedQueries() {
        for (const category of this._loadedCategories) {
            delete this[category];
        }

        this._loadedCategories.clear();
    }

    _unloadScopedDatabase() {
        this._deleteLoadedQueries();
    }

    async _unloadDatabase() {
        if (this._queryRoot !== null) {
            this._unloadScopedDatabase();
            return;
        }

        if (!this._queryLoader?.loaded) {
            this._queryLoader = null;
            this._deleteLoadedQueries();
            return;
        }

        this._deleteLoadedQueries();
        await this._queryLoader.deleteQueries();

        this._queryLoader = null;
    }
}

export default SqlDatabase;
