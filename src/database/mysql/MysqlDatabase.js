import MysqlPool from "./MysqlPool.js";
import DatabaseError from "../../errors/DatabaseError.js";

let pool;

function createPool() {
    if (typeof pool !== "undefined") {
        pool.end();
        pool = undefined;
    }

    pool = new MysqlPool(MysqlDatabase.config);
}

class MysqlDatabase {
    constructor() {
        if (typeof this.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.pool = pool;
    }

    static createPool() {
        createPool();
        this.pool = pool;
    }

    static setConfig(config, initPool = false) {
        this.config = config;

        if (initPool) {
            this.createPool();
        }
    }

    async run(sql, ...param) {}

    async get(sql, ...param) {}

    async all(sql, ...param) {}

    async each(sql, param, callback) {}

    async exec(sql) {}
}

export default MysqlDatabase;
