class MysqlStatement {
    constructor(db, sql, defaultParam) {
        this.db = db;

        this.sql = sql;
        this.defaultParam = defaultParam;

        this.finalize = _ => {};
    }
}

export default MysqlStatement;
