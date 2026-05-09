import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

import DatabaseEvents from "../../../../src/database/drivers/sqlite/DatabaseEvents.js";
import SqliteDatabase from "../../../../src/database/drivers/sqlite/SqliteDatabase.js";

let tempDir;
let dbs;

function createDb(filename, config = {}) {
    const db = new SqliteDatabase(path.join(tempDir, filename), undefined, {
        enableWALMode: false,
        ...config
    });

    dbs.push(db);
    return db;
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sqlite-db-"));
    dbs = [];
});

afterEach(async () => {
    for (const db of dbs) {
        if (db.db != null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("SqliteDatabase", () => {
    test("runs real sqlite statements, transactions, pragmas, and close guards", async () => {
        const db = createDb("main.sqlite");

        await expect(db.get("SELECT 1")).rejects.toThrow("The database is not open");
        await db.open();
        await expect(db.open()).rejects.toThrow("The database is open");

        expect(db.configure("busyTimeout", 50)).toBe(db.db);

        await db.exec("CREATE TABLE Items (id INTEGER PRIMARY KEY, value TEXT UNIQUE) STRICT;");
        const inserted = await db.run("INSERT INTO Items (value) VALUES ($value)", { $value: "alpha" });
        expect(inserted.lastID).toBe(1);

        expect((await db.get("SELECT value FROM Items WHERE id = 1")).value).toBe("alpha");
        expect((await db.all("SELECT value FROM Items")).map(row => row.value)).toEqual(["alpha"]);

        const prepared = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await prepared.run("beta");
        await prepared.finalize();

        await db.beginTransaction();
        await db.run("INSERT INTO Items (value) VALUES ('gamma')");
        await db.rollback();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta"
        ]);

        await db.beginTransaction();
        await db.run("INSERT INTO Items (value) VALUES ('gamma')");
        await db.commit();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma"
        ]);

        await db.beginTransaction();
        await db.commit();
        await db.rollback();

        await db.pragma("cache_size=10");
        await db.enableWALMode();
        expect(db.WALMode).toBe(true);
        await db.disableWALMode();
        expect(db.WALMode).toBe(false);
        db.interrupt();
        await db.vacuum();

        await db.close();
        await expect(db.close()).rejects.toThrow("The database is not open");
    });

    test("emits promise errors and auto-rolls back when configured not to throw", async () => {
        const db = createDb("soft.sqlite", {
            throwErrors: false,
            autoRollback: true
        });
        const errors = [];

        db.on(DatabaseEvents.promiseError, err => errors.push(err.message));

        expect(await db.run("CREATE TABLE Nope (id INTEGER)")).toBeUndefined();

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        await db.beginTransaction();
        await db.run("INSERT INTO Items VALUES ('x')");
        expect(await db.run("INSERT INTO Items VALUES ('x')")).toBeUndefined();
        expect(db.inTransaction).toBe(false);
        expect((await db.get("SELECT COUNT(*) AS count FROM Items")).count).toBe(0);

        expect(await db.get("SELECT * FROM Missing")).toBeUndefined();
        await db.close();

        expect(db.configure("busyTimeout", 1)).toBeUndefined();
        expect(errors.some(message => message.includes("not open"))).toBe(true);
        expect(errors.some(message => message.includes("UNIQUE"))).toBe(true);
    });
});
