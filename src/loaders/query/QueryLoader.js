import path from "node:path";

import DirectoryLoader from "../DirectoryLoader.js";
import QueryFileLoader from "./QueryFileLoader.js";

import ArrayUtil from "../../util/ArrayUtil.js";
import TypeTester from "../../util/TypeTester.js";
import Util from "../../util/Util.js";

import LoadStatus from "../LoadStatus.js";

class QueryLoader extends DirectoryLoader {
    constructor(dirPath, logger, options) {
        options = TypeTester.isObject(options) ? options : {};

        super("query", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            pluralName: "queries",
            dataField: "queries",
            fileExtension: options.fileExtension ?? ".sql",
            fileLoaderClass: QueryFileLoader
        });

        this.db = options.db ?? null;
        this.rewriteFunc = options.rewriteQueryStrings;
        this.loadCreate = options.loadCreate ?? true;
        this.loadQueries = options.loadQueries ?? true;

        this.encoding = options.encoding ?? "utf8";
        this.createFilename = `create${this.fileExtension}`;

        this.queryStrings = {};
        this.createString = "";
        this.createQueries = [];

        this.queries = {};
        this.queryList = [];
    }

    async load() {
        const status = this.loaded ? LoadStatus.successful : await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        if (this.loadCreate) {
            this._loadCreateData();

            if (Util.empty(this.createQueries)) {
                return this.failure("Create query not found");
            }
        }

        if (this.loadQueries) {
            await this._loadPreparedQueries();
        }

        return LoadStatus.successful;
    }

    async prepareQueries(db = this.db) {
        this.db = db ?? null;
        this._rewriteQueries();

        await this._finalizeQueries();

        if (this.db == null) {
            this.queries = this.queryStrings;
            return this.queries;
        }

        const queries = {};

        for (const category of Object.keys(this.queryStrings)) {
            const categoryQueries = {},
                strings = this.queryStrings[category];

            for (const query of Object.keys(strings)) {
                const queryString = strings[query],
                    statement = await this.db.prepare(queryString);

                categoryQueries[query] = statement;
                this.queryList.push(statement);
            }

            queries[category] = categoryQueries;
        }

        this.queries = queries;
        return queries;
    }

    async deleteQueries() {
        this.logger?.debug("Deleting queries...");

        this.deleteAllData();

        const n = await this._finalizeQueries();

        delete this.createString;
        delete this.createQueries;
        delete this.queryStrings;
        delete this.queries;

        this.logger?.debug(`Deleted ${n} queries.`);
    }

    getLoadingMessage() {
        return `Loading ${this.getPluralName()}...`;
    }

    getLoadedMessage() {
        return `Loaded ${this.getPluralName()} successfully.`;
    }

    _isCreateQuery(filePath) {
        const relativePath = path.relative(this.dirPath, filePath),
            parsed = path.parse(relativePath);

        return parsed.dir === "" && `${parsed.name}${parsed.ext}` === this.createFilename;
    }

    _getCategoryName(filePath) {
        const relativePath = path.relative(this.dirPath, filePath),
            relativeDir = path.dirname(relativePath),
            normalizedDir = relativeDir === "." ? "" : relativeDir,
            categoryName = normalizedDir.split(path.sep).find(Boolean);

        return typeof categoryName === "string" ? `${categoryName}Queries` : "queries";
    }

    _getQueryName(filePath) {
        return path.parse(filePath).name;
    }

    _getCreateString() {
        this.createString = "";

        for (const [filePath, queryString] of this.data) {
            if (this._isCreateQuery(filePath)) {
                this.createString = queryString;
                break;
            }
        }

        return this.createString;
    }

    _getCreateQueries() {
        if (!Util.nonemptyString(this.createString)) {
            this.createQueries = [];
            return this.createQueries;
        }

        this.createQueries = this.createString
            .split("---")
            .map(query => query.trim())
            .filter(Boolean);

        return this.createQueries;
    }

    _loadCreateData() {
        this._getCreateString();
        return this._getCreateQueries();
    }

    _getQueryStrings() {
        const queryStrings = {};

        for (const [filePath, queryString] of this.data) {
            if (this._isCreateQuery(filePath)) {
                continue;
            }

            const categoryName = this._getCategoryName(filePath),
                queryName = this._getQueryName(filePath);

            queryStrings[categoryName] ??= {};
            queryStrings[categoryName][queryName] = queryString;
        }

        this.queryStrings = queryStrings;
        return queryStrings;
    }

    _rewriteQueries() {
        if (this.db == null || typeof this.rewriteFunc !== "function") {
            return;
        }

        const rewritten = this.rewriteFunc(this.queryStrings);

        if (TypeTester.isObject(rewritten)) {
            this.queryStrings = rewritten;
        }
    }

    async _loadPreparedQueries() {
        this._getQueryStrings();
        return await this.prepareQueries();
    }

    async _finalizeQueries() {
        return await ArrayUtil.wipeArray(this.queryList, async statement => {
            if (!statement.finalized) {
                await statement.finalize();
            }
        });
    }
}

export default QueryLoader;
