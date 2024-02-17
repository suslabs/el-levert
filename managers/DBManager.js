import path from "path";
import fs from "fs/promises";

import { getClient, getLogger } from "../LevertClient.js";
import Util from "../util/Util.js";

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

class DBManager {
    constructor(name, dbFilename, classType, fieldName) {
        this.name = name;
        this.dbDir = getClient().config.dbPath;
        this.dbFilename = dbFilename;

        this.classType = classType;
        this.fieldName = fieldName;
    }

    async loadDatabase() {
        const dbPath = path.join(this.dbDir, this.dbFilename);
        this.dbPath = dbPath;

        const db = new this.classType(dbPath);
        this[this.fieldName] = db;

        if (!(await this.checkDatabase())) {
            await this.createDatabase();
        }

        await db.load();
        getLogger().info(`Successfully loaded ${this.name} database.`);
    }

    async checkDatabase() {
        if (!directoryExists(this.dbDir)) {
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

        await this[this.fieldName].create_db();
    }
}

export default DBManager;
