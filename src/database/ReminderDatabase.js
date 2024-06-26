import SqliteDatabase from "./SqlDatabase.js";

import Reminder from "../structures/Reminder.js";

class ReminderDatabase extends SqliteDatabase {
    async fetch(user) {
        const rows = await this.queries.fetch.all({
            $user: user
        });

        if (typeof rows._data === "undefined" || rows.length < 1) {
            return false;
        }

        const reminders = rows.map(x => new Reminder(x));
        reminders.sort((a, b) => a.end - b.end);

        return reminders;
    }

    async add(reminder) {
        return await this.queries.add.run({
            $user: reminder.user,
            $end: reminder.end,
            $msg: reminder.msg
        });
    }

    async remove(reminder) {
        return await this.queries.remove.run({
            $id: reminder.id
        });
    }

    async removeAll(user) {
        return await this.queries.removeAll.run({
            $user: user
        });
    }

    async list() {
        const rows = await this.queries.list.all(),
            reminders = rows.map(x => new Reminder(x));

        reminders.sort((a, b) => a.end - b.end);
        return reminders;
    }
}

export default ReminderDatabase;
