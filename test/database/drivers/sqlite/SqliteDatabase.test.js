import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

import { DatabaseEvents } from "../../../../src/database/drivers/sqlite/DatabaseEvents.js";
import { PoolEvents } from "../../../../src/database/drivers/sqlite/PoolEvents.js";
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
        if (db?.db != null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, {
        recursive: true,
        force: true
    });
});

describe("SqliteDatabase", () => {
    test("runs pooled sql, nested transactions, pragmas, backups, and close guards", async () => {
        const db = createDb("main.sqlite", {
            min: 1,
            max: 2
        });
        const backupPath = path.join(tempDir, "backup.sqlite");

        await expect(db.get("SELECT 1")).rejects.toThrow("The database is not open");
        await db.open();
        expect(() => db.open()).toThrow("The database is open");

        expect(db.db).toBe(db.pool);
        expect(db.configure("busyTimeout", 50)).toBe(db);

        await db.exec("CREATE TABLE Items (id INTEGER PRIMARY KEY, value TEXT UNIQUE) STRICT;");
        const inserted = await db.run("INSERT INTO Items (value) VALUES ($value)", {
            $value: "alpha"
        });

        expect(inserted.lastID).toBe(1);
        expect((await db.get("SELECT value FROM Items WHERE id = 1")).value).toBe("alpha");
        expect((await db.all("SELECT value FROM Items")).map(row => row.value)).toEqual(["alpha"]);

        await db.transactionImmediate(async tx => {
            await tx.run("INSERT INTO Items (value) VALUES ('beta')");

            await expect(
                tx.transactionImmediate(async nested => {
                    await nested.run("INSERT INTO Items (value) VALUES ('gamma')");
                    await nested.run("INSERT INTO Items (value) VALUES ('alpha')");
                })
            ).rejects.toThrow("UNIQUE");

            await tx.run("INSERT INTO Items (value) VALUES ('delta')");
        });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "delta"
        ]);

        await db.pragma("cache_size=10");
        expect(typeof (await db.pragma("cache_size", { simple: true }))).toBe("number");
        expect((await db.tableInfo("Items")).map(row => row.name)).toEqual(["id", "value"]);
        expect(await db.tableExists("Items")).toBe(true);
        await db.enableWALMode();
        expect(db.WALMode).toBe(true);
        await db.disableWALMode();
        expect(db.WALMode).toBe(false);
        await db.vacuum();

        const backup = await db.backup(backupPath);
        expect(backup.remainingPages).toBe(0);

        const backupDb = createDb("backup.sqlite");
        await backupDb.open();
        expect((await backupDb.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "delta"
        ]);

        await db.close();
        await expect(db.close()).rejects.toThrow("The database is not open");
    });

    test("copies root functions and statement containers to intersecting pinned transactions", async () => {
        const db = createDb("copied.sqlite", {
            min: 1,
            max: 2
        });

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        await db.createFunction("double", value => value * 2, 1, true);

        const insert = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await db.run("SELECT double(21) AS value");

        const tx1 = await db.beginTransaction("immediate"),
            tx2 = await db.beginTransaction("deferred"),
            txInsert1 = await tx1.bindStatement(insert),
            txInsert2 = await tx2.bindStatement(insert);

        expect((await tx1.get("SELECT double(21) AS value")).value).toBe(42);
        expect((await tx2.get("SELECT double(21) AS value")).value).toBe(42);
        expect(txInsert1._conn).not.toBe(txInsert2._conn);

        await txInsert1.run("alpha");
        await tx1.commit();

        await txInsert2.run("beta");
        await tx2.rollback();

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["alpha"]);
    });

    test("emits promise errors, auto-rolls back, and releases pinned sessions", async () => {
        const db = createDb("soft.sqlite", {
            min: 1,
            max: 1,
            throwErrors: false,
            autoRollback: true
        });
        const errors = [];
        const poolEvents = [];

        await db.open();
        db.pool.on(PoolEvents.acquire, () => poolEvents.push("acquire"));
        db.pool.on(PoolEvents.release, () => poolEvents.push("release"));

        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        const tx = await db.beginTransaction();
        tx.on(DatabaseEvents.promiseError, err => errors.push(err.message));
        expect(db.pool.pool.borrowed).toBe(1);

        const local = await tx.prepare("INSERT INTO Items (value) VALUES (?)");
        await local.run("alpha");
        expect(await local.run("alpha")).toBeUndefined();
        expect(tx.inTransaction).toBe(false);
        expect(local.finalized).toBe(true);

        await new Promise(resolve => setImmediate(resolve));
        expect(db.pool.pool.borrowed).toBe(0);
        expect(poolEvents).toContain("acquire");
        expect(poolEvents).toContain("release");
        expect(errors.some(message => message.includes("UNIQUE"))).toBe(true);
        expect((await db.get("SELECT COUNT(*) AS count FROM Items")).count).toBe(0);
    });
});
