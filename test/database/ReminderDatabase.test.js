import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import ReminderDatabase from "../../src/database/ReminderDatabase.js";
import OpenModes from "../../src/database/drivers/sqlite/OpenModes.js";
import Reminder from "../../src/structures/Reminder.js";

import Util from "../../src/util/Util.js";

const reminderQueryPath = path.resolve(projRoot, "src/database/query/reminder");
const reminderMigrationsPath = path.resolve(projRoot, "src/database/migrations/reminder");

let tempDir;
let openDatabases;

function createReminderDb(filename = "reminders.sqlite") {
    const dbPath = path.join(tempDir, filename);
    return new ReminderDatabase(dbPath, reminderQueryPath, { enableWAL: false });
}

async function track(db) {
    openDatabases.push(db);
    await db.create();
    await db.load();
    return db;
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-db-"));
    openDatabases = [];
});

afterEach(async () => {
    for (const db of openDatabases) {
        if (db.db !== null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("ReminderDatabase", () => {
    test("stores reminders with generated ids and returns them sorted by end time", async () => {
        const db = await track(createReminderDb());

        await db.add(new Reminder({ user: "42", end: 3000, msg: "late" }));
        await db.add(new Reminder({ user: "42", end: 1000, msg: "early" }));
        await db.add(new Reminder({ user: "99", end: 2000, msg: "other" }));

        expect(await db.exists("42")).toBe(true);
        expect(await db.exists("404")).toBe(false);
        expect(await db.exists(["42", "404", "99"])).toEqual([true, false, true]);
        expect(await db.exists([])).toEqual([]);

        const userReminders = await db.fetch("42");
        expect(userReminders.map(reminder => reminder.msg)).toEqual(["early", "late"]);
        expect(userReminders.map(reminder => reminder.id)).toEqual([2, 1]);

        const allReminders = await db.list();
        expect(allReminders.map(reminder => reminder.user)).toEqual(["42", "99", "42"]);

        await db.remove(userReminders[0]);
        expect((await db.fetch("42")).map(reminder => reminder.msg)).toEqual(["late"]);

        await db.removeAll("42");
        expect(await db.fetch("42")).toBeNull();
        expect(await db.exists("42")).toBe(false);
        expect((await db.list()).map(reminder => reminder.user)).toEqual(["99"]);
    });

    test("fetches by id, updates end time and interval", async () => {
        const db = await track(createReminderDb()),
            minuteMs = Util.durationSeconds.minute / Util.durationSeconds.milli,
            twoMinutesMs = (2 * Util.durationSeconds.minute) / Util.durationSeconds.milli;

        await db.add(new Reminder({ user: "42", end: 1000, msg: "repeat", interval: minuteMs }));
        const list = await db.fetch("42");
        expect(list).toHaveLength(1);

        const reminder = list[0];
        expect(reminder.interval).toBe(minuteMs);

        const fetched = await db.fetchById(reminder.id);
        expect(fetched).not.toBeNull();
        expect(fetched.msg).toBe("repeat");
        expect(fetched.interval).toBe(minuteMs);

        reminder.end = 2000;
        reminder.interval = twoMinutesMs;
        await db.update(reminder);

        const updated = await db.fetchById(reminder.id);
        expect(updated.end).toBe(2000);
        expect(updated.msg).toBe("repeat");
        expect(updated.interval).toBe(twoMinutesMs);

        expect(await db.fetchById(99999)).toBeNull();
    });

    test("migrates a totally unmigrated database lacking interval column and migrations table", async () => {
        const dbPath = path.join(tempDir, "legacy_reminders.sqlite");
        const rawDb = new ReminderDatabase(dbPath, reminderQueryPath, {
            enableWAL: false,
            migrationsPath: reminderMigrationsPath
        });
        openDatabases.push(rawDb);

        await rawDb.open(OpenModes.OPEN_RWCREATE);
        await rawDb.db.exec(`
            CREATE TABLE 'Reminders' (
                'id' INTEGER,
                'user' TEXT NOT NULL CHECK (trim(user) != ''),
                'end' INTEGER,
                'msg' TEXT NOT NULL CHECK (trim(msg) != ''),
                PRIMARY KEY('id' AUTOINCREMENT)
            ) STRICT;
            CREATE INDEX 'idx_Reminders_user' ON 'Reminders' ('user');
            CREATE INDEX 'idx_Reminders_end' ON 'Reminders' ('end');
        `);

        await rawDb.db.run("INSERT INTO Reminders ('user', 'end', 'msg') VALUES ('user1', 5000, 'legacy msg');");

        await rawDb.load();

        const migrationRows = Array.from(await rawDb.db.all("SELECT id FROM migrations ORDER BY id ASC;")).map(
            row => row.id
        );
        expect(migrationRows).toEqual([1]);

        const reminders = await rawDb.fetch("user1");
        expect(reminders).toHaveLength(1);
        expect(reminders[0]).toMatchObject({
            user: "user1",
            end: 5000,
            msg: "legacy msg",
            interval: null
        });

        const newReminder = new Reminder({
            user: "user1",
            end: 10000,
            msg: "recurring msg",
            interval: (60 * Util.durationSeconds.minute) / Util.durationSeconds.milli
        });
        await rawDb.add(newReminder);

        const fetchedAll = await rawDb.fetch("user1");
        expect(fetchedAll).toHaveLength(2);
        expect(fetchedAll[1].interval).toBe((60 * Util.durationSeconds.minute) / Util.durationSeconds.milli);
    });
});
