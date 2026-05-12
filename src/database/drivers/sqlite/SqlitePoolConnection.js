import SqliteConnection from "./SqliteConnection.js";

class SqlitePoolConnection extends SqliteConnection {
    constructor(pool, db) {
        super(pool._getConnectionConfig(), db);

        this.pool = pool;
    }

    release() {
        if (this._released) {
            return;
        }

        this._released = true;
        this.pool.releaseConnection(this);
    }

    async destroy() {
        if (this._released) {
            return;
        }

        this._released = true;
        await this.pool.destroyConnection(this);
    }
}

export default SqlitePoolConnection;
