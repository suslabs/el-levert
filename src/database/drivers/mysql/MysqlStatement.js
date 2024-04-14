class MysqlStatement {
    constructor(db, sql, defaultParam) {
        this.db = db;

        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalized = false;
    }

    finalize(removeEntry = true) {
        this.finalized = true;

        if (!removeEntry) {
            return;
        }

        this.db.removeStatement(this);
    }

    bind(...param) {
        this.defaultParam = param;
        return this;
    }

    reset() {
        return this;
    }

    run(sql, ...param) {}

    get(sql, ...param) {}

    all(sql, ...param) {}

    each(sql, param, callback) {}

    async getConnection() {
        if (typeof this.con !== "undefined") {
            this.releaseConnection();
        }

        const con = await this.db.getConnection(false);
        con.throwErrors = true;

        this.con = con;
    }

    releaseConnection() {
        if (typeof this.con === "undefined") {
            return;
        }

        this.db.releaseConnection(this.con);
        delete this.con;
    }
}

export default MysqlStatement;
