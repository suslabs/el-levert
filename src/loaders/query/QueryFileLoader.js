import TextFileLoader from "../TextFileLoader.js";
import LoadStatus from "../LoadStatus.js";

class QueryFileLoader extends TextFileLoader {
    constructor(filePath, logger, options = {}) {
        super("query", filePath, logger, {
            throwOnFailure: true,
            ...options,
            type: null
        });
    }
}

export default QueryFileLoader;
