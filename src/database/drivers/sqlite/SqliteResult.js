import ProxiedResult from "../common/ProxiedResult.js";
import ResultProxyHandler from "../common/ResultProxyHandler.js";

class SqliteResult extends ProxiedResult {
    constructor(data, st) {
        super();

        this.setData(data);
        this.setInfo({
            lastID: st?.lastID,
            changes: st?.changes
        });

        const isArray = Array.isArray(data),
            target = isArray ? data : this;

        if (isArray) {
            ResultProxyHandler.registerTarget(data, this);
        }

        return new Proxy(target, ResultProxyHandler);
    }
}

export default SqliteResult;
