import path from "path";
import fs from "fs/promises";

import Manager from "../Manager.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import databaseFilenames from "./databaseFilenames.json" assert { type: "json" };

async function directoryExists(path) {
    let stat;

    try {
        stat = await fs.stat(path);
    } catch (err) {
        if (err.code === "ENOENT") {
            return false;
        }

        throw err;
    }

    if (typeof stat !== "undefined") {
        return stat.isDirectory();
    }
}

class DBManager extends Manager {
    constructor(enabled, name, classType, fieldName) {
        super(enabled);

        this.name = name;

        this.dbDir = getClient().config.dbPath;

        const dbFilename = databaseFilenames[name];
        this.dbPath = path.resolve(this.dbDir, dbFilename);

        const queryBase = getClient().config.queryPath;
        this.queryDir = path.resolve(queryBase, name);

        this.classType = classType;
        this.fieldName = fieldName;
    }

    async loadDatabase() {
        const db = new this.classType(this.dbPath, this.queryDir);
        this[this.fieldName] = db;

        if (!(await this.checkDatabase())) {
            await this.createDatabase();
        }

        await db.load();
        getLogger().info(`Successfully loaded ${this.name} database.`);
    }

    async checkDatabase() {
        if (!(await directoryExists(this.dbDir))) {
            await fs.mkdir(this.dbDir, {
                recursive: true
            });
        }

        try {
            await fs.access(this.dbPath);
        } catch (err) {
            return false;
        }

        return true;
    }

    async createDatabase() {
        const name = Util.firstCharUpper(this.name);
        getLogger().info(`${name} database not found. Creating at path: ${this.dbPath}`);

        await this[this.fieldName].create();
    }

    load() {
        return this.loadDatabase();
    }
}

export default DBManager;
