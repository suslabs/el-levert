import { AsyncDatabase, Modes } from "./AsyncDatabase.js";
import Util from "../util/Util.js";

const createReminderSt = `CREATE TABLE "Reminders" (
	"id"	TEXT,
	"end"	INTEGER,
    "msg"   TEXT,
	"ind"	TEXT
);`;

const fetchSt = "SELECT * FROM Reminders WHERE id = $id",
      addSt = "INSERT INTO Reminders VALUES ($id, $end, $msg, $ind);",
      removeSt = "DELETE FROM Reminders WHERE id = $id AND ind = $ind",
      removeAllSt = "DELETE FROM Reminders WHERE id = $id;",
      listSt = "SELECT * FROM Reminders";

class ReminderDatabase {
    constructor(path) {
        this.dbPath = path;
    }

    async create_db() {
        const db = new AsyncDatabase(this.dbPath, Modes.OPEN_RWCREATE);
        await db.open();

        await db.run(createReminderSt);

        await db.close();
    }

    async load() {
        this.db = new AsyncDatabase(this.dbPath, Modes.OPEN_READWRITE);
        await this.db.open();
    }

    async fetch(id) {
        const rows = await this.db.all(fetchSt, {
            $id: id
        });

        if(typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows;
    }

    add(id, end, msg) {
        const ind = Util.randString(5) + "-" + Math.floor(Date.now() / 1000).toString();
       
        return this.db.run(addSt, {
            $id: id,
            $end: end,
            $msg: msg,
            $ind: ind
        });
    }

    remove(id, ind) {
        return this.db.run(removeSt, {
            $id: id,
            $ind: ind
        });
    }

    removeAll(id) {
        return this.db.run(removeAllSt, {
            $id: id
        });
    }

    list() {
        return this.db.all(listSt);
    }
}

export default ReminderDatabase;