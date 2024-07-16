import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

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

    async run(sql, ...param) {}

    async get(sql, ...param) {}

    async all(sql, ...param) {}

    async each(sql, param, callback) {}

    async getConnection() {
        if (typeof this.con !== "undefined") {
            return this.con;
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
