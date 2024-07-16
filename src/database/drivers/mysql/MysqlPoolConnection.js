import MysqlConnection from "./MysqlConnection.js";

class MysqlPoolConnection extends MysqlConnection {
    constructor(pool, connection) {
        super(
            {
                throwErrors: pool.throwErrors
            },
            connection
        );

        this.pool = pool;
    }

    release() {
        this.pool.releaseConnection(this);
    }
}

export default MysqlPoolConnection;
