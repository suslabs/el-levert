import ProxiedResult from "../common/ProxiedResult.js";
import ResultProxyHandler from "../common/ResultProxyHandler.js";

class MysqlResult extends ProxiedResult {
    constructor(data) {
        super();

        this.setData(data);
        this.setInfo(st);

        return new Proxy(this, ResultProxyHandler);
    }
}

export default MysqlResult;
