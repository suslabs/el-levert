import EventEmitter from "node:events";

import StatementDatabase from "../common/StatementDatabase.js";

import MysqlPool from "./MysqlPool.js";
import DatabaseError from "../../../errors/DatabaseError.js";

import EventPrefixes from "./EventPrefixes.js";
import PoolEvents from "./PoolEvents.js";
import ConnectionEvents from "./ConnectionEvents.js";

import MysqlStatement from "./MysqlStatement.js";
import DatabaseUtil from "../../../util/database/DatabaseUtil.js";

let pool;

function createPool() {
    if (typeof pool !== "undefined") {
        endPool();
    }

    pool = new MysqlPool(MysqlDatabase.config);
}

async function endPool() {
    await pool.end();
    pool = undefined;
}

class MysqlDatabase extends StatementDatabase(EventEmitter) {
    constructor() {
        super();

        if (typeof this.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.inTransaction = false;
        DatabaseUtil.registerPrefixedEvents(this.pool, this, EventPrefixes.pool, PoolEvents);

        this.config = MysqlDatabase.config;
        this.pool = MysqlDatabase.pool;

        this.open = MysqlDatabase.open;
        this.close = async function () {
            await this.finalizeAll();
            await MysqlDatabase.close();
        };
    }

    static open() {
        if (typeof this.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        createPool();
        this.pool = pool;
    }

    static async close() {
        await endPool();
        delete this.pool;
    }

    static setConfig(config, open = false) {
        this.config = config;
        this.throwErrors = config.throwErrors;

        if (open) {
            this.open();
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

    async exec(sql) {
        const con = await this.getConnection(false);

        try {
            await con.query(sql);
        } finally {
            this.releaseConnection(con);
        }

        return this;
    }

    prepare(sql, ...param) {
        const st = new MysqlStatement(this, sql, param);
        this.addStatement(st);

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
        if (this.inTransaction) {
            return;
        }

        const con = await this.getConnection(false);

        try {
            await con.beginTransaction();
        } finally {
            this.inTransaction = con.inTransaction;
            this.releaseConnection(con);
        }
    }

    async commit() {
        if (!this.inTransaction) {
            return;
        }

        const con = await this.getConnection(false);

        try {
            await con.commit();
        } finally {
            this.inTransaction = con.inTransaction;
            this.releaseConnection(con);
        }
    }

    async rollback() {
        if (!this.inTransaction) {
            return;
        }

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
