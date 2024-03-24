import path from "path";
import fs from "fs/promises";

import Util from "../util/Util.js";

import { AsyncDatabase, Modes } from "./sqlite/AsyncDatabase.js";

class Database {
    constructor(dbPath, queryPath, options = {}) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

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
        let db;

        if (typeof this.db === "undefined") {
            db = new AsyncDatabase(this.dbPath, mode);
        } else {
            db = this.db;
        }

        try {
            await db.open();
        } catch (err) {
            if (err.message !== "Cannot open database. The database is already open.") {
                throw err;
            }
        }

        this.db = db;
    }

    async create() {
        await this.open(Modes.OPEN_RWCREATE);

        await this.loadCreateQuery();
        const split = this.createString.split("---");
        split.forEach(x => x.trim());

        for (const query of split) {
            await this.db.run(query);
        }
    }

    async readQuery(queryPath, categoryName) {
        const parsed = path.parse(queryPath);

        if (parsed.name === "create" || parsed.ext !== this.queryExtension) {
            return;
        }

        const queryString = await fs.readFile(queryPath, {
            encoding: this.queryEncoding
        });
        queryString.trim();

        if (typeof categoryName === "undefined") {
            categoryName = "queries";
        } else {
            categoryName += "Queries";
        }

        if (typeof this.queryStrings[categoryName] === "undefined") {
            this.queryStrings[categoryName] = {};
        }

        this.queryStrings[categoryName][parsed.name] = queryString;
    }

    async readDirectory(dirPath) {
        const dirName = path.basename(dirPath),
            items = await fs.readdir(dirPath);

        for (const item of items) {
            const itemPath = path.resolve(dirPath, item),
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
            const itemPath = path.resolve(this.queryPath, item),
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
        for (let i = 0; i < this.queryList.length; i++) {
            await this.queryList[i].finalize();
            delete this.queryList[i];
        }

        for (const category in this.queryStrings) {
            delete this[category];
        }
    }

    async close() {
        await this.unloadQueries();
        return await this.db.close();
    }

    async load() {
        await this.open(Modes.OPEN_READWRITE);
        await this.loadQueries();
    }
}

export default Database;
