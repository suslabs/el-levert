import SqliteDatabase from "./drivers/sqlite/SqliteDatabase.js";

import QueryLoader from "../loaders/query/QueryLoader.js";
import MigrationLoader from "../loaders/migration/MigrationLoader.js";

import { OpenModes } from "./drivers/sqlite/OpenModes.js";
import { LoadStatus } from "../loaders/LoadStatus.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DatabaseUtil from "../util/database/DatabaseUtil.js";

class SqlDatabase {
    static getMigrationSql(table = "migrations") {
        const tableName = DatabaseUtil.quoteIdentifier(table, "Migration table name");

        return Object.freeze({
            createTable:
                `CREATE TABLE IF NOT EXISTS ${tableName} ` +
                "(id INTEGER PRIMARY KEY, name TEXT NOT NULL, up TEXT NOT NULL, down TEXT NOT NULL);",
            selectIds: `SELECT id FROM ${tableName};`,
            insertApplied: `INSERT INTO ${tableName} (id, name, up, down) VALUES ($id, $name, $up, $down);`
        });
    }

    static migrationSql = SqlDatabase.getMigrationSql();

    constructor(dbPath, queryPath, options) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        options = ObjectUtil.guaranteeObject(options);
        this.options = options;

        this._setOptions(options);

        this.db = null;

        this._queryLoaders = new Map();
        this._createQueries = [];
        this._queryRoot = null;
        this._migrations = new Map();
        this._loadedCategories = new Set();

        if (this.queryPath != null) {
            this._registerQueryPath(this.queryPath);
        }

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
        await this._loadCreateQueries();

        for (const query of this._createQueries) {
            await this.db.run(query);
        }

        if (this.migrationsPath != null) {
            const migrations = await this._loadMigrations();
            await this._seedAppliedMigrations(migrations.map(m => m.id));
        }

        await this.setup("create");
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
        options = ObjectUtil.guaranteeObject(options);
        await this.open(OpenModes.OPEN_RWCREATE);

        const migrationsPath = options.migrationsPath ?? this.migrationsPath;

        return await this.db.migrate({
            ...options,
            migrationsPath
        });
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

        this.acquireTimeout = options.acquireTimeout ?? 5 / Util.durationSeconds.milli;
        this.busyTimeout = options.busyTimeout;
        this.delayRelease = options.delayRelease ?? false;

        this.loadExtensions = new Set(options.loadExtensions ?? []);
        this.customFunctions = new Map(options.customFunctions ?? []);
        this.transactionMode = options.transactionMode ?? "immediate";

        this.rewriteFunc = typeof options.rewriteQueryStrings === "function" ? options.rewriteQueryStrings : undefined;
    }

    _registerQueryPath(queryPath) {
        if (Util.nonemptyString(queryPath) && !this._queryLoaders.has(queryPath)) {
            this._queryLoaders.set(queryPath, null);
        }
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

    _getQueryLoader(queryPath, options) {
        let loader = this._queryLoaders.get(queryPath);

        if (loader == null) {
            loader = new QueryLoader(queryPath, this.logger, this._getQueryLoaderOptions(options));
            this._queryLoaders.set(queryPath, loader);
        } else {
            this._setQueryLoaderOptions(loader, options);
        }

        return loader;
    }

    async _loadCreateQueries() {
        this._createQueries = [];

        for (const queryPath of this._queryLoaders.keys()) {
            const loader = this._getQueryLoader(queryPath, {
                loadCreate: true,
                loadQueries: false
            });

            const [, status] = await loader.load();

            if (status === LoadStatus.failed) {
                return null;
            }

            this._createQueries.push(...loader.createQueries);
        }

        return this._createQueries;
    }

    _deleteLoadedQueries() {
        for (const category of this._loadedCategories) {
            delete this[category];
        }

        this._loadedCategories.clear();
    }

    _assignQueries(queries) {
        for (const [category, value] of Object.entries(queries)) {
            this[category] = value;
            this._loadedCategories.add(category);
        }
    }

    _getQueryLoaders() {
        return Array.from(this._queryLoaders.values()).filter(Boolean);
    }

    async _loadScopedDatabase() {
        const root = this._queryRoot;

        if (root === null) {
            return null;
        }

        const loaders = root._getQueryLoaders();

        if (Util.empty(loaders) || loaders.some(loader => !loader.loaded)) {
            return null;
        }

        this._deleteLoadedQueries();

        const queries = {};

        for (const loader of loaders) {
            for (const [categoryName, categoryQueries] of Object.entries(loader.queries)) {
                const scopedQueries = {};

                for (const [queryName, st] of Object.entries(categoryQueries)) {
                    scopedQueries[queryName] = await this.db.bindStatement(st);
                }

                queries[categoryName] = scopedQueries;
            }
        }

        this._assignQueries(queries);
        return queries;
    }

    async _loadDatabase() {
        if (this._queryRoot !== null) {
            return await this._loadScopedDatabase();
        }

        this._deleteLoadedQueries();

        for (const queryPath of this._queryLoaders.keys()) {
            const loader = this._getQueryLoader(queryPath, {
                db: this,
                rewriteQueryStrings: this.rewriteFunc,
                loadCreate: false,
                loadQueries: true
            });

            const [, status] = await loader.load();

            if (status === LoadStatus.failed) {
                return null;
            }

            this._assignQueries(loader.queries);
        }

        return true;
    }

    async _setup(...args) {
        if (typeof this._childSetup === "function") {
            await this._childSetup.apply(this, args);
        }

        if (args[0] === "load" && this.migrationsPath != null) {
            await this.db.migrate({
                migrationsPath: this.migrationsPath
            });
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

    async _seedAppliedMigrations(ids, migrationsPath = this.migrationsPath, table = "migrations") {
        const migrations = await this._loadMigrations(migrationsPath),
            migrationSql = SqlDatabase.getMigrationSql(table);

        await this.db.transactionImmediate(async tx => {
            await tx.run(migrationSql.createTable);

            const rows = await tx.all(migrationSql.selectIds),
                existing = new Set(rows.map(row => row.id));

            for (const migration of migrations) {
                if ((ids != null && !ids.includes(migration.id)) || existing.has(migration.id)) {
                    continue;
                }

                await tx.run(migrationSql.insertApplied, {
                    $id: migration.id,
                    $name: migration.name,
                    $up: migration.up,
                    $down: migration.down
                });
            }
        });
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

    _unloadScopedDatabase() {
        this._deleteLoadedQueries();
    }

    _resetQueryLoaders() {
        for (const queryPath of this._queryLoaders.keys()) {
            this._queryLoaders.set(queryPath, null);
        }
    }

    async _unloadDatabase() {
        if (this._queryRoot !== null) {
            this._unloadScopedDatabase();
            return;
        }

        const loaders = this._getQueryLoaders();

        if (Util.empty(loaders) || loaders.every(loader => !loader.loaded)) {
            this._resetQueryLoaders();
            this._deleteLoadedQueries();
            return;
        }

        this._deleteLoadedQueries();

        for (const loader of loaders) {
            await loader.deleteQueries();
        }

        this._resetQueryLoaders();
        this._createQueries = [];
    }
}

export default SqlDatabase;
