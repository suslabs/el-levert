class MysqlConnection {
    constructor(connection, throwErrors) {
        this.con = connection;
        this.throwErrors = throwErrors;
    }
}

export default MysqlConnection;
