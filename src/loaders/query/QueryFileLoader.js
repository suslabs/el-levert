import TextLoader from "../TextLoader.js";

import TypeTester from "../../util/TypeTester.js";

class QueryFileLoader extends TextLoader {
    constructor(filePath, logger, options) {
        options = TypeTester.isObject(options) ? options : {};

        super("query", filePath, logger, {
            throwOnFailure: true,
            ...options,
            encoding: options.encoding ?? options.parent?.encoding,
            type: null
        });
    }

    getLoadedMessage() {
        return `Loaded ${this.getName()}: ${this.filename}`;
    }
}

export default QueryFileLoader;
