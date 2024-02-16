import crypto from "crypto";

import { AsyncDatabase, Modes } from "./AsyncDatabase.js";

const createReminderTable = `CREATE TABLE "Reminders" (
	"id"	TEXT,
	"end"	INTEGER,
    "msg"   TEXT,
	"ind"	TEXT
);`,
    remind_st = {
        fetch: "SELECT * FROM Reminders WHERE id = $id",
        add: "INSERT INTO Reminders VALUES ($id, $end, $msg, $ind);",
        remove: "DELETE FROM Reminders WHERE id = $id AND ind = $ind",
        removeAll: "DELETE FROM Reminders WHERE id = $id;",
        list: "SELECT * FROM Reminders"
    };

class ReminderDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(createReminderTable);

        await db.close();
    }

    async load() {
        this.db = new AsyncDatabase(this.dbPath, Modes.OPEN_READWRITE);
        await this.db.open();

        this.remind_st = {};

        for (const st in remind_st) {
            this.remind_st[st] = await this.db.prepare(remind_st[st]);
        }
    }

    async fetch(id) {
        const rows = await this.remind_st.fetch.all({
            $id: id
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows;
    }

    add(id, end, msg) {
        const ind = crypto.randomBytes(5).toString("hex") + "-" + Math.floor(Date.now() / 1000).toString();

        return this.remind_st.add.run({
            $id: id,
            $end: end,
            $msg: msg,
            $ind: ind
        });
    }

    remove(id, ind) {
        return this.remind_st.remove.run({
            $id: id,
            $ind: ind
        });
    }

    removeAll(id) {
        return this.remind_st.removeAll.run({
            $id: id
        });
    }

    list() {
        return this.remind_st.list.all();
    }
}

export default ReminderDatabase;
