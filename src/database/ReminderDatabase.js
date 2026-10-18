import SqlDatabase from "./SqlDatabase.js";

import Reminder from "../structures/Reminder.js";

import Util from "../util/Util.js";
import ObjectUtil from "../util/ObjectUtil.js";
import DatabaseUtil from "../util/database/DatabaseUtil.js";

class ReminderDatabase extends SqlDatabase {
    constructor(dbPath, queryPath, options) {
        options = ObjectUtil.guaranteeObject(options);

        const customFunctions = new Map();

        super(dbPath, queryPath, {
            ...options,
            customFunctions
        });
    }

    async exists(user) {
        return await DatabaseUtil.exists(user, this.queries.exists, this.queries.existsMultiple, "user");
    }

    async fetch(user) {
        const rows = await this.queries.fetch.all({
            $user: user
        });

        if (Util.empty(rows)) {
            return null;
        }

        const reminders = DatabaseUtil.rowEntity(rows, Reminder);
        reminders.sort((a, b) => a.end - b.end);

        return reminders;
    }

    async fetchById(id) {
        const row = await this.queries.fetchById.get({
            $id: id
        });

        return DatabaseUtil.rowEntity(row, Reminder);
    }

    async add(reminder) {
        return await this.queries.add.run({
            ...reminder.getData("$", true, ["user", "end", "msg", "interval"])
        });
    }

    async update(reminder) {
        return await this.queries.update.run({
            ...reminder.getData("$", true, ["id", "end", "interval"])
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
            reminders = DatabaseUtil.rowEntity(rows, Reminder);

        reminders.sort((a, b) => a.end - b.end);
        return reminders;
    }
}

export default ReminderDatabase;
