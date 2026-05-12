import TextLoader from "../TextLoader.js";

import TypeTester from "../../util/TypeTester.js";

import LoadStatus from "../LoadStatus.js";

import DatabaseError from "../../errors/DatabaseError.js";

class MigrationFileLoader extends TextLoader {
    static filenameRegex = /^(\d+)[.-](.*?)$/;

    constructor(filePath, logger, options) {
        options = TypeTester.isObject(options) ? options : {};

        super("migration", filePath, logger, {
            throwOnFailure: true,
            ...options,
            encoding: options.encoding ?? options.parent?.encoding,
            type: null
        });
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.data = this._getParsedMigration();
        return LoadStatus.successful;
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this._filename}`;
    }

    _getParsedMigration() {
        const match = this._filename.match(this.constructor.filenameRegex);

        if (match === null) {
            throw new DatabaseError(`Invalid migration filename: ${this._filename}`);
        }

        const [up, down] = this._splitMigrationSql();

        return {
            id: Number(match[1]),
            name: match[2],
            filename: `${this._filename}.sql`,
            up: this._stripSqlComments(up),
            down: this._stripSqlComments(down)
        };
    }

    _splitMigrationSql() {
        const match = this.data.match(/^\s*--\s*up\s*$([\s\S]*?)^\s*--\s*down\s*$([\s\S]*)$/im);

        if (match === null) {
            throw new DatabaseError(`The file must contain '-- up' and '-- down' labels`);
        }

        return [match[1], match[2]];
    }

    _stripSqlComments(sql) {
        return sql.replace(/^\s*--.*?$/gm, "").trim();
    }
}

export default MigrationFileLoader;
