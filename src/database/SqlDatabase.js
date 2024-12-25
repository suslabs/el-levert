import path from "node:path";
import fs from "node:fs/promises";

import Util from "../util/Util.js";

import SqliteDatabase from "./drivers/sqlite/SqliteDatabase.js";
import OpenModes from "./drivers/sqlite/OpenModes.js";

class SqlDatabase {
    constructor(dbPath, queryPath, options = {}) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        this.options = options;

        this.queryExtension = options.queryExtension ?? ".sql";
        this.queryEncoding = options.queryEncoding ?? "utf-8";

        this.createString = "";
        this.queryStrings = {};

        this.queryList = [];
    }

    async loadCreateQuery() {
        const filename = "create" + this.queryExtension,
            createPath = path.join(this.queryPath, filename);

        this.createString = await fs.readFile(createPath, {
            encoding: this.queryEncoding
        });
    }

    async open(mode) {
        const dbConfig = {
            enableWALMode: true
        };

        let db;

        if (typeof this.db === "undefined") {
            db = new SqliteDatabase(this.dbPath, mode, dbConfig);
        } else {
            db = this.db;
        }

        try {
            await db.open();
        } catch (err) {
            if (err.message !== "Cannot open database. The database is already open") {
                throw err;
            }
        }

        this.db = db;
    }

    async create() {
        await this.open(OpenModes.OPEN_RWCREATE);

        await this.loadCreateQuery();
        let split = this.createString.split("---");
        split = split.map(x => x.trim());

        for (const query of split) {
            await this.db.run(query);
        }
    }

    isValidQueryPath(queryPath) {
        const parsed = path.parse(queryPath);

        if (parsed.dir === this.queryPath && parsed.name === "create") {
            return false;
        }

        if (parsed.ext !== this.queryExtension) {
            return false;
        }

        return true;
    }

    async readQuery(queryPath, categoryName) {
        if (!this.isValidQueryPath(queryPath)) {
            return;
        }

        let queryString = await fs.readFile(queryPath, {
            encoding: this.queryEncoding
        });

        queryString = queryString.trim();

        if (typeof categoryName === "undefined") {
            categoryName = "queries";
        } else {
            categoryName += "Queries";
        }

        if (typeof this.queryStrings[categoryName] === "undefined") {
            this.queryStrings[categoryName] = {};
        }

        const filename = path.parse(queryPath).name;
        this.queryStrings[categoryName][filename] = queryString;
    }

    async readDirectory(dirPath) {
        const dirName = path.basename(dirPath),
            items = await fs.readdir(dirPath);

        for (const item of items) {
            const itemPath = path.join(dirPath, item),
                stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                const queryPaths = Util.getFilesRecSync(itemPath);

                for (const queryPath of queryPaths) {
                    await this.readQuery(queryPath, dirName);
                }
            } else {
                await this.readQuery(itemPath, dirName);
            }
        }
    }

    async readQueries() {
        const items = await fs.readdir(this.queryPath);

        for (const item of items) {
            const itemPath = path.join(this.queryPath, item),
                stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                await this.readDirectory(itemPath);
            } else {
                await this.readQuery(itemPath);
            }
        }
    }

    async bindQueries() {
        for (const category in this.queryStrings) {
            const queries = {},
                strings = this.queryStrings[category];

            for (const query in strings) {
                const queryString = strings[query],
                    statement = await this.db.prepare(queryString);

                queries[query] = statement;
                this.queryList.push(statement);
            }

            this[category] = queries;
        }
    }

    async loadQueries() {
        await this.readQueries();
        await this.bindQueries();
    }

    async unloadQueries() {
        Util.wipeArray(this.queryList);
        Util.wipeObject(this.queryStrings, category => delete this[category]);
    }

    async close() {
        await this.unloadQueries();
        await this.db.close();
    }

    async load() {
        await this.open(OpenModes.OPEN_READWRITE);
        await this.loadQueries();
    }
}

export default SqlDatabase;
