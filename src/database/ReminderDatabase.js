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

    async count(user) {
        const row = await this.queries.count.get({
            $user: user
        });

        return row.count;
    }

    async fetch(user, options = {}) {
        options = ObjectUtil.guaranteeObject(options, "limit");

        const limit = options.limit ?? -1,
            offset = options.offset ?? 0;

        const rows = await this.queries.fetch.all({ $user: user });

        if (Util.empty(rows)) {
            return null;
        }

        const reminders = this._sortReminders(rows);
        return reminders.slice(offset, limit < 0 ? undefined : offset + limit);
    }

    async fetchById(id) {
        const row = await this.queries.fetchById.get({
            $id: id
        });

        return DatabaseUtil.rowEntity(row, Reminder);
    }

    async add(reminder) {
        const result = await this.queries.add.run({
            ...reminder.getData("$", true, ["user", "start", "end", "msg", "interval"])
        });

        reminder.id = result.lastID;
        return result;
    }

    async update(reminder) {
        return await this.queries.update.run({
            ...reminder.getData("$", true, ["id", "start", "end", "interval"])
        });
    }

    async remove(reminder) {
        return await this.queries.remove.run({
            $id: reminder.id
        });
    }

    async removeScheduled(reminder) {
        return await this.queries.removeScheduled.run({
            ...reminder.getData("$", true, ["id", "start", "end", "interval"])
        });
    }

    async removeAll(user) {
        return await this.queries.removeAll.run({
            $user: user
        });
    }

    async list() {
        const rows = await this.queries.list.all();
        return this._sortReminders(rows);
    }

    _sortReminders(rows) {
        const reminders = DatabaseUtil.rowEntity(rows, Reminder),
            now = Date.now();

        reminders.sort(
            (a, b) =>
                a.getOccurrence(a.getOccurrenceIndex(now, true)) - b.getOccurrence(b.getOccurrenceIndex(now, true))
        );
        return reminders;
    }
}

export default ReminderDatabase;
