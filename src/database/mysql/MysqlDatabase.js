import EventEmitter from "events";

import MysqlPool from "./MysqlPool.js";
import DatabaseError from "../../errors/DatabaseError.js";

import EventPrefixes from "./EventPrefixes.js";
import PoolEvents from "./PoolEvents.js";
import ConnectionEvents from "./ConnectionEvents.js";

import MysqlStatement from "./MysqlStatement.js";
import DatabaseUtil from "../../util/DatabaseUtil.js";

let pool;

function createPool() {
    if (typeof pool !== "undefined") {
        endPool();
    }

    pool = new MysqlPool(MysqlDatabase.config);
}

function endPool() {
    pool.end();
    pool = undefined;
}

class MysqlDatabase extends EventEmitter {
    constructor() {
        if (typeof this.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.pool = pool;
        this.inTransaction = false;

        DatabaseUtil.registerPrefixedEvents(this.pool, this, EventPrefixes.pool, PoolEvents);
    }

    static createPool() {
        if (typeof this.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        createPool();
        this.pool = pool;
    }

    static endPool() {
        endPool();
        delete this.pool;
    }

    static setConfig(config, initPool = false) {
        this.config = config;
        this.throwErrors = config.throwErrors;

        if (initPool) {
            this.createPool();
        }
    }

    run(sql, ...param) {
        const st = this.prepare(sql);
        return st.run(...param);
    }

    get(sql, ...param) {
        const st = this.prepare(sql);
        return st.get(...param);
    }

    all(sql, ...param) {
        const st = this.prepare(sql);
        return st.all(...param);
    }

    each(sql, param, callback) {
        const st = this.prepare(sql);
        return st.each(param, callback);
    }

    exec(sql) {
        const st = this.prepare(sql);
        return st.exec();
    }

    prepare(sql, ...param) {
        const st = new MysqlStatement(this, sql, param);
        return st;
    }

    async getConnection(registerEvents = true) {
        const con = await this.pool.getConnection();

        con.inTransaction = this.inTransaction;
        con.registeredEvents = registerEvents;

        if (registerEvents) {
            DatabaseUtil.registerPrefixedEvents(con, this, EventPrefixes.connection, ConnectionEvents);
        }

        return con;
    }

    releaseConnection(con) {
        if (con.registeredEvents) {
            DatabaseUtil.removePrefixedEvents(con, this, EventPrefixes.connection, ConnectionEvents);
        }

        con.release();
    }

    async beginTransaction() {
        const con = await this.getConnection(false);

        try {
            await con.beginTransaction();
        } finally {
            this.inTransaction = con.inTransaction;
            this.releaseConnection(con);
        }
    }

    async commit() {
        const con = await this.getConnection(false);

        try {
            await con.commit();
        } finally {
            this.inTransaction = con.inTransaction;
            this.releaseConnection(con);
        }
    }

    async rollback() {
        const con = await this.getConnection(false);

        try {
            await con.rollback();
        } finally {
            this.inTransaction = con.inTransaction;
            this.releaseConnection(con);
        }
    }
}

export default MysqlDatabase;
