import fs from "node:fs/promises";
import path from "node:path";

import Manager from "../Manager.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";

import dbFilenames from "../../database/config/dbFilenames.json" assert { type: "json" };

class DBManager extends Manager {
    constructor(enabled, dbName, fieldName, classType) {
        super(enabled);

        this.dbName = dbName;
        this.fieldName = fieldName;

        this._classType = classType;

        this._setPaths();
    }

    async checkDatabase() {
        if (!(await Util.directoryExists(this._dbDir))) {
            await fs.mkdir(this._dbDir, {
                recursive: true
            });
        }

        try {
            await fs.access(this._dbPath);
        } catch (err) {
            return false;
        }

        return true;
    }

    async load() {
        return await this._loadDatabase();
    }

    async unload() {
        return await this._closeDatabase();
    }

    static _dbOptions = {
        queryExtension: dbFilenames.queryExtension,
        queryEncoding: dbFilenames.queryEncoding
    };

    _setPaths() {
        this._dbDir = getClient().config.dbPath;

        const dbFilename = dbFilenames[this.dbName];
        this._dbPath = path.resolve(projRoot, this._dbDir, dbFilename);

        const queryBase = dbFilenames.queryPath;
        this._queryDir = path.resolve(projRoot, queryBase, this.dbName);
    }

    async _createDatabase() {
        const name = Util.capitalize(this.dbName);
        getLogger().info(`${name} database not found. Creating at path: ${this._dbPath}`);

        await this[this.fieldName].create();
    }

    async _loadDatabase() {
        const db = new this._classType(this._dbPath, this._queryDir, DBManager._dbOptions);
        this[this.fieldName] = db;

        if (!(await this.checkDatabase())) {
            await this._createDatabase();
        }

        await db.load();
        getLogger().info(`Successfully loaded ${this.dbName} database.`);
    }

    async _closeDatabase() {
        await this[this.fieldName].close();
        delete this[this.fieldName];
        getLogger().info(`Successfully closed ${this.dbName} database.`);
    }
}

export default DBManager;
