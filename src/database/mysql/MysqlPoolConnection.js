import MysqlConnection from "./MysqlConnection.js";

class MysqlPoolConnection extends MysqlConnection {
    constructor(connection) {
        super(connection);

        this.pool = connection._pool;
    }

    release() {
        return this.con.release();
    }

    destroy() {
        return this.con.destroy();
    }
}

export default MysqlPoolConnection;
