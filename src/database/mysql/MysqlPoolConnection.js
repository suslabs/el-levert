import MysqlConnection from "./MysqlConnection.js";

class MysqlPoolConnection extends MysqlConnection {
    constructor(connection) {
        super(null, connection);

        this.pool = connection._pool;
    }

    release() {
        return this.pool.releaseConnection(this);
    }
}

export default MysqlPoolConnection;
