import BaseDatabase from "../BaseDatabase.js";

import Reminder from "./Reminder.js";

class ReminderDatabase extends BaseDatabase {
    async fetch(user) {
        const rows = await this.queries.fetch.all({
            $user: user
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return false;
        }

        return rows.map(x => new Reminder(x));
    }

    add(reminder) {
        return this.queries.add.run({
            $user: reminder.user,
            $end: reminder.end,
            $msg: reminder.msg,
            $id: reminder.id
        });
    }

    remove(reminder) {
        return this.queries.remove.run({
            $user: reminder.user,
            $id: reminder.id
        });
    }

    removeAll(user) {
        return this.queries.removeAll.run({
            $user: user
        });
    }

    async list() {
        const rows = await this.queries.list.all();
        return rows.map(x => new Reminder(x));
    }
}

export default ReminderDatabase;
