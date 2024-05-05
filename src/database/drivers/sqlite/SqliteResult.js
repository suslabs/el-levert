import ProxiedResult from "../common/ProxiedResult.js";
import ResultProxyHandler from "../common/ResultProxyHandler.js";

class SqliteResult extends ProxiedResult {
    constructor(data, st) {
        super();

        this.setData(data);
        this.setInfo({
            lastID: st.lastID,
            changes: st.changes
        });

        return new Proxy(this, ResultProxyHandler);
    }
}

export default SqliteResult;
