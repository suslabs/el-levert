import mysql from "mysql";

const MysqlUtil = {
    createQuery: (sql, values, callback) => {
        return mysql.Connection.createQuery(sql, values, callback);
    }
};

export default MysqlUtil;
