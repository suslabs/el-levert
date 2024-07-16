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

        if (typeof MysqlDatabase.config === "undefined") {
            throw new DatabaseError("No config provided");
        }

        this.inTransaction = false;

        this.config = MysqlDatabase.config;
        this.pool = MysqlDatabase.pool;

        this.open = MysqlDatabase.open;
        this.close = async function () {
            await this.finalizeAll();
            await MysqlDatabase.close();
        };

        DatabaseUtil.registerPrefixedEvents(this.pool, this, EventPrefixes.pool, PoolEvents);
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

    async run(sql, ...param) {
        const st = this.prepare(sql);

        try {
            const res = await st.run(...param);
            return res;
        } finally {
            this.removeStatement(st);
        }
    }

    async get(sql, ...param) {
        const st = this.prepare(sql);

        try {
            const res = await st.get(...param);
            return res;
        } finally {
            this.removeStatement(st);
        }
    }

    async all(sql, ...param) {
        const st = this.prepare(sql);

        try {
            const res = await st.all(...param);
            return res;
        } finally {
            this.removeStatement(st);
        }
    }

    async each(sql, param, callback) {
        const st = this.prepare(sql);

        try {
            const res = await st.each(param, callback);
            return res;
        } finally {
            this.removeStatement(st);
        }
    }

    async query(sql) {
        const con = await this.getConnection(false);

        try {
            const res = await con.query(sql);
            return res;
        } finally {
            this.releaseConnection(con);
        }
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
            DatabaseUtil.registerPrefixedEvents(con, this, con.eventName, ConnectionEvents);
        }

        return con;
    }

    releaseConnection(con) {
        if (con.registeredEvents) {
            DatabaseUtil.removePrefixedEvents(con, this, con.eventName, ConnectionEvents);
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
