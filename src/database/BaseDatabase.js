import path, { dirname } from "path";
import fs from "fs/promises";

import Util from "../util/Util.js";

import { AsyncDatabase, Modes } from "./sqlite/AsyncDatabase.js";

const extension = ".sql",
    encoding = "utf-8";

class BaseDatabase {
    constructor(dbPath, queryPath) {
        this.dbPath = dbPath;
        this.queryPath = queryPath;

        this.createString = "";
        this.queryStrings = {};
    }

    async loadCreateQuery() {
        const filename = "create" + extension,
            createPath = path.join(this.queryPath, filename);

        this.createString = await fs.readFile(createPath, {
            encoding
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

    close() {
        return this.db.close();
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

        if (parsed.name === "create" || parsed.ext !== extension) {
            return;
        }

        const queryString = await fs.readFile(queryPath, {
            encoding
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

    async readQueries() {
        async function readDirectory(dirPath) {
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

        const items = await fs.readdir(this.queryPath);

        for (const item of items) {
            const itemPath = path.resolve(this.queryPath, item),
                stat = await fs.stat(itemPath);

            if (stat.isDirectory()) {
                await readDirectory.bind(this)(itemPath);
            } else {
                await this.readQuery(itemPath);
            }
        }
    }

    async loadQueries() {
        for (const category in this.queryStrings) {
            const queries = {},
                strings = this.queryStrings[category];

            for (const query in strings) {
                const queryString = strings[query];
                queries[query] = await this.db.prepare(queryString);
            }

            this[category] = queries;
        }
    }

    async load() {
        await this.open(Modes.OPEN_READWRITE);

        await this.readQueries();
        await this.loadQueries();
    }
}

export default BaseDatabase;
