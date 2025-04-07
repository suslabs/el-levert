import fs from "node:fs/promises";
import path from "node:path";

import SqliteDatabase from "./drivers/sqlite/SqliteDatabase.js";

import ArrayUtil from "../util/ArrayUtil.js";
import ObjectUtil from "../util/ObjectUtil.js";

import OpenModes from "./drivers/sqlite/OpenModes.js";
import DirectoryLoader from "../loaders/DirectoryLoader.js";

class SqlDatabase {
    constructor(dbPath, queryPath, options = {}) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        this.options = options;

        this.queryExtension = options.queryExtension ?? ".sql";
        this.queryEncoding = options.queryEncoding ?? "utf-8";
        this.enableWAL = options.enableWAL ?? true;

        this.db = null;

        this.createString = "";
        this.queryStrings = {};

        this.queryList = [];
    }

    async open(mode) {
        const dbConfig = {
            enableWALMode: this.enableWAL
        };

        let db;

        if (this.db === null) {
            db = new SqliteDatabase(this.dbPath, mode, dbConfig);
        } else {
            db = this.db;
        }

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

        await this._loadCreateQuery();
        const queries = this.createString.split("---").map(query => query.trim());

        for (const query of queries) {
            await this.db.run(query);
        }
    }

    async load() {
        await this.open(OpenModes.OPEN_READWRITE);
        await this._loadQueries();
    }

    async close() {
        this._unloadQueries();
        await this.db.close();
    }

    async _loadCreateQuery() {
        const filename = `create${this.queryExtension}`,
            createPath = path.join(this.queryPath, filename);

        this.createString = await fs.readFile(createPath, {
            encoding: this.queryEncoding
        });
    }

    _isValidQueryPath(queryPath) {
        const parsed = path.parse(queryPath);

        if (parsed.dir === this.queryPath && parsed.name === "create") {
            return false;
        }

        if (parsed.ext !== this.queryExtension) {
            return false;
        }

        return true;
    }

    async _readQuery(queryPath, categoryName) {
        if (!this._isValidQueryPath(queryPath)) {
            return;
        }

        let queryString = await fs.readFile(queryPath, {
            encoding: this.queryEncoding
        });

        queryString = queryString.trim();

        if (typeof categoryName === "string") {
            categoryName += "Queries";
        } else {
            categoryName = "queries";
        }

        if (typeof this.queryStrings[categoryName] === "undefined") {
            this.queryStrings[categoryName] = {};
        }

        const filename = path.parse(queryPath).name;
        this.queryStrings[categoryName][filename] = queryString;
    }

    async _readDirectory(dirPath) {
        const dirName = path.basename(dirPath);

        await DirectoryLoader.listFilesRecursiveAsync(dirPath, Infinity, async itemPath => {
            await this._readQuery(itemPath, dirName);
        });
    }

    async _readQueries() {
        await DirectoryLoader.listFilesRecursiveAsync(this.queryPath, 1, async (itemPath, type) => {
            if (type === "directory") {
                await this._readDirectory(itemPath);
            } else {
                await this._readQuery(itemPath);
            }
        });
    }

    async _bindQueries() {
        for (const category of Object.keys(this.queryStrings)) {
            const queries = {},
                strings = this.queryStrings[category];

            for (const query of Object.keys(strings)) {
                const queryString = strings[query],
                    statement = await this.db.prepare(queryString);

                queries[query] = statement;
                this.queryList.push(statement);
            }

            this[category] = queries;
        }
    }

    async _loadQueries() {
        await this._readQueries();
        await this._bindQueries();
    }

    _unloadQueries() {
        ArrayUtil.wipeArray(this.queryList);
        ObjectUtil.wipeObject(this.queryStrings, category => delete this[category]);
    }
}

export default SqlDatabase;
