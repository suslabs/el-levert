import Database from "./Database.js";

import Reminder from "../structures/Reminder.js";

class ReminderDatabase extends Database {
    async fetch(user) {
        const rows = await this.queries.fetch.all({
            $user: user
        });

        if (typeof rows === "undefined" || rows.length < 1) {
            return undefined;
        }

        return rows.map(x => new Reminder(x));
    }

    async add(reminder) {
        return await this.queries.add.run({
            $user: reminder.user,
            $end: reminder.end,
            $msg: reminder.msg,
            $id: reminder.id
        });
    }

    async remove(reminder) {
        return await this.queries.remove.run({
            $user: reminder.user,
            $id: reminder.id
        });
    }

    async removeAll(user) {
        return await this.queries.removeAll.run({
            $user: user
        });
    }

    async list() {
        const rows = await this.queries.list.all();
        return rows.map(x => new Reminder(x));
    }
}

export default ReminderDatabase;
