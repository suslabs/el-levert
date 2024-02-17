import { AsyncDatabase, Modes } from "../sqlite/AsyncDatabase.js";

import Reminder from "./Reminder.js";

const createReminderTable = `CREATE TABLE "Reminders" (
	"user"	TEXT,
	"end"	INTEGER,
    "msg"   TEXT,
	"id"	TEXT
);`,
    remind_st = {
        fetch: "SELECT * FROM Reminders WHERE user = $user",
        add: "INSERT INTO Reminders VALUES ($user, $end, $msg, $id);",
        remove: "DELETE FROM Reminders WHERE user = $user AND id = $id",
        removeAll: "DELETE FROM Reminders WHERE user = $user;",
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

    async fetch(user) {
        const rows = await this.remind_st.fetch.all({
            $user: user
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows.map(x => new Reminder(x));
    }

    add(reminder) {
        return this.remind_st.add.run({
            $user: reminder.user,
            $end: reminder.end,
            $msg: reminder.msg,
            $id: reminder.id
        });
    }

    remove(reminder) {
        return this.remind_st.remove.run({
            $user: reminder.user,
            $id: reminder.id
        });
    }

    removeAll(user) {
        return this.remind_st.removeAll.run({
            $user: user
        });
    }

    async list() {
        const rows = await this.remind_st.list.all();
        return rows.map(x => new Reminder(x));
    }
}

export default ReminderDatabase;
