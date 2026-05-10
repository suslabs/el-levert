import SqlDatabase from "./SqlDatabase.js";

import Reminder from "../structures/Reminder.js";

import Util from "../util/Util.js";

class ReminderDatabase extends SqlDatabase {
    async exists(user) {
        if (Array.isArray(user)) {
            if (Util.empty(user)) {
                return [];
            }

            const rows = await this.queries.existsMultiple.all({
                    $users: JSON.stringify(user)
                }),
                existing = new Set(rows.map(row => row.user));

            return user.map(userId => existing.has(userId));
        } else {
            const row = await this.queries.exists.get({
                $user: user
            });

            return typeof row._data !== "undefined";
        }
    }

    async fetch(user) {
        const rows = await this.queries.fetch.all({
            $user: user
        });

        if (typeof rows._data === "undefined" || Util.empty(rows)) {
            return null;
        }

        const reminders = rows.map(row => new Reminder(row));
        reminders.sort((a, b) => a.end - b.end);

        return reminders;
    }

    async add(reminder) {
        return await this.queries.add.run({
            ...reminder.getData("$", true, ["user", "end", "msg"])
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
            reminders = rows.map(row => new Reminder(row));

        reminders.sort((a, b) => a.end - b.end);
        return reminders;
    }
}

export default ReminderDatabase;
