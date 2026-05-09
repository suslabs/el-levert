import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import ReminderDatabase from "../../src/database/ReminderDatabase.js";
import Reminder from "../../src/structures/Reminder.js";

const reminderQueryPath = path.resolve(projRoot, "src/database/query/reminder");

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

        const userReminders = await db.fetch("42");
        expect(userReminders.map(reminder => reminder.msg)).toEqual(["early", "late"]);
        expect(userReminders.map(reminder => reminder.id)).toEqual([2, 1]);

        const allReminders = await db.list();
        expect(allReminders.map(reminder => reminder.user)).toEqual(["42", "99", "42"]);

        await db.remove(userReminders[0]);
        expect((await db.fetch("42")).map(reminder => reminder.msg)).toEqual(["late"]);

        await db.removeAll("42");
        expect(await db.fetch("42")).toBeNull();
        expect((await db.list()).map(reminder => reminder.user)).toEqual(["99"]);
    });
});
