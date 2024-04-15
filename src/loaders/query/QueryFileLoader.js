import FileLoader from "../FileLoader.js";
import LoadStatus from "../LoadStatus.js";

class QueryFileLoader extends FileLoader {
    constructor(filePath, logger, options = {}) {
        super("query", filePath, logger, {
            throwOnFailure: true,
            ...options,
            type: null
        });
    }
}

export default QueryFileLoader;
