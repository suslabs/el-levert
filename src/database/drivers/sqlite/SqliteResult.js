import ProxiedResult from "../common/ProxiedResult.js";
import ResultProxyHandler from "../common/ResultProxyHandler.js";

class SqliteResult extends ProxiedResult {
    constructor(data, st) {
        super();

        this.setData(data);
        this.setInfo(st);

        const proxy = new Proxy(this, ResultProxyHandler);

        return proxy;
    }
}

export default SqliteResult;
