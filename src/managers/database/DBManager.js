import path from "node:path";
import fs from "node:fs/promises";

import Manager from "../Manager.js";

import { getClient, getLogger } from "../../LevertClient.js";
import Util from "../../util/Util.js";

import dbFilenames from "../../database/config/dbFilenames.json" assert { type: "json" };

const dbOptions = {
    queryExtension: dbFilenames.queryExtension,
    queryEncoding: dbFilenames.queryEncoding
};

class DBManager extends Manager {
    constructor(enabled, dbName, classType, fieldName) {
        super(enabled);

        this.dbName = dbName;
        this.classType = classType;
        this.fieldName = fieldName;

        this.setPaths();
    }

    setPaths() {
        this.dbDir = getClient().config.dbPath;

        const dbFilename = dbFilenames[this.dbName];
        this.dbPath = path.resolve(projRoot, this.dbDir, dbFilename);

        const queryBase = dbFilenames.queryPath;
        this.queryDir = path.resolve(projRoot, queryBase, this.dbName);
    }

    async checkDatabase() {
        if (!(await Util.directoryExists(this.dbDir))) {
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
        const name = Util.capitalize(this.dbName);
        getLogger().info(`${name} database not found. Creating at path: ${this.dbPath}`);

        await this[this.fieldName].create();
    }

    async loadDatabase() {
        const db = new this.classType(this.dbPath, this.queryDir, dbOptions);
        this[this.fieldName] = db;

        if (!(await this.checkDatabase())) {
            await this.createDatabase();
        }

        await db.load();
        getLogger().info(`Successfully loaded ${this.dbName} database.`);
    }

    async closeDatabase() {
        await this[this.fieldName].close();
    }

    async load() {
        return await this.loadDatabase();
    }

    async unload() {
        return await this.closeDatabase();
    }
}

export default DBManager;
