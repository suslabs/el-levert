import path from "path";

import DirectoryLoader from "../DirectoryLoader.js";
import QueryFileLoader from "./QueryFileLoader.js";
import LoadStatus from "../LoadStatus.js";

function getCategory(filePath, rootPath) {
    let categoryDir = path.dirname(filePath);
    categoryDir = categoryDir.slice(rootPath.length);

    let categoryName = categoryDir.split(path.sep)[0];

    if (typeof categoryName === "undefined") {
        categoryName = "queries";
    } else {
        categoryName += "Queries";
    }

    return categoryName;
}

getQueryName(filePath) {
    
}

class QueryLoader extends DirectoryLoader {
    constructor(dirPath, db, logger, options = {}) {
        super("event", dirPath, logger, {
            throwOnFailure: true,
            ...options,
            fileLoaderClass: QueryFileLoader
        });

        this.db = db;
    }

    async load() {
        const status = await super.load();

        if (status === LoadStatus.failed) {
            return status;
        }

        this.getStrings();

        await this.bindQueries();

        return LoadStatus.successful();
    }

    getStrings() {
        const queryStrings = {},
            rootPath = this.dirPath + path.sep;

        for (const filePath in this.data) {
        }

        this.queryStrings = queryStrings;
    }

    async bindQueries() {
        const queries = {},
            queryList = [];

        for (const category in this.queryStrings) {
            const strings = this.queryStrings[category];

            for (const query in strings) {
                const queryString = strings[query],
                    statement = await this.db.prepare(queryString);

                queries[category][query] = statement;
                queryList.push(statement);
            }
        }

        this.queries = queries;
        this.queryList = queryList;

        this.data = queries;
    }

    async unloadQueries() {
        for (let i = 0; i < this.queryList.length; i++) {
            await this.queryList[i].finalize();
            delete this.queryList[i];
        }

        for (const category in this.queryStrings) {
            delete this.queries[category];
        }
    }
}

export default QueryLoader;
