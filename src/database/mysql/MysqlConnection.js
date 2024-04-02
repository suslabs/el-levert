import mysql from "mysql";

class MysqlConnection {
    constructor(config = null, connection) {
        if (config === null) {
            this.con = connection;
            this.config = connection.config;
            this.throwErrors = this.config.throwErrors;
        } else {
            this.config = config;
            this.connection = mysql.createConnection(config);

            if (typeof config.throwErrors === "boolean") {
                this.throwErrors = onfig.throwErrors;
            } else {
                this.throwErrors = true;
            }
        }
    }
}

export default MysqlConnection;
