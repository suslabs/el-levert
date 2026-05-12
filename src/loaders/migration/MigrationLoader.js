import DirectoryLoader from "../DirectoryLoader.js";
import MigrationFileLoader from "./MigrationFileLoader.js";

import TypeTester from "../../util/TypeTester.js";

import LoadStatus from "../LoadStatus.js";

class MigrationLoader extends DirectoryLoader {
    constructor(dirPath, logger, options) {
        options = TypeTester.isObject(options) ? options : {};

        super("migration", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            dataField: "migrations",
            pluralName: "migrations",
            fileExtension: ".sql",
            fileLoaderClass: MigrationFileLoader
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this._getMigrations();
        return LoadStatus.successful;
    }

    _getMigrations() {
        if (Array.isArray(this.migrations)) {
            return this.migrations;
        }

        if (!(this.data instanceof Map)) {
            this.migrations = [];
            return this.migrations;
        }

        const migrations = Array.from(this.data.values()).sort((a, b) => a.id - b.id);

        this.migrations = migrations;
        return migrations;
    }
}

export default MigrationLoader;
