import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

import DatabaseEvents from "../../../../src/database/drivers/sqlite/DatabaseEvents.js";
import PoolEvents from "../../../../src/database/drivers/sqlite/PoolEvents.js";
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
    test("runs pooled sqlite statements, session transactions, pragmas, backups, and close guards", async () => {
        const db = createDb("main.sqlite", {
            min: 1,
            max: 2
        });
        const backupPath = path.join(tempDir, "backup.sqlite");

        await expect(db.get("SELECT 1")).rejects.toThrow("The database is not open");
        await db.open();
        await expect(db.open()).rejects.toThrow("The database is open");

        expect(db.db).toBe(db.pool);
        expect(db.configure("busyTimeout", 50)).toBe(db);

        await db.exec("CREATE TABLE Items (id INTEGER PRIMARY KEY, value TEXT UNIQUE) STRICT;");
        const inserted = await db.run("INSERT INTO Items (value) VALUES ($value)", { $value: "alpha" });
        expect(inserted.lastID).toBe(1);

        expect((await db.get("SELECT value FROM Items WHERE id = 1")).value).toBe("alpha");
        expect((await db.all("SELECT value FROM Items")).map(row => row.value)).toEqual(["alpha"]);

        const prepared = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await prepared.run("beta");
        await prepared.finalize();

        const trx1 = await db.beginTransaction();
        await trx1.run("INSERT INTO Items (value) VALUES ('gamma')");
        await trx1.rollback();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta"
        ]);

        const trx2 = await db.beginTransaction();
        await trx2.run("INSERT INTO Items (value) VALUES ('gamma')");
        await trx2.commit();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma"
        ]);

        await db.transactionImmediate(async trx => {
            await trx.run("INSERT INTO Items (value) VALUES ('delta')");

            try {
                await trx.transactionImmediate(async nested => {
                    await nested.run("INSERT INTO Items (value) VALUES ('epsilon')");
                    await nested.run("INSERT INTO Items (value) VALUES ('alpha')");
                });
            } catch (err) {
                expect(err.message).toContain("UNIQUE");
            }

            await trx.run("INSERT INTO Items (value) VALUES ('zeta')");
        });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "delta",
            "gamma",
            "zeta"
        ]);

        await db.pragma("cache_size=10");
        expect(typeof (await db.pragma("cache_size", { simple: true }))).toBe("number");
        await db.enableWALMode();
        expect(db.WALMode).toBe(true);
        await db.disableWALMode();
        expect(db.WALMode).toBe(false);
        db.interrupt();
        await db.vacuum();

        const backup = await db.backup(backupPath);
        expect(backup.remainingPages).toBe(0);

        const backupDb = createDb("backup.sqlite");
        await backupDb.open();
        expect((await backupDb.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "delta",
            "gamma",
            "zeta"
        ]);

        await db.close();
        await expect(db.close()).rejects.toThrow("The database is not open");
    });

    test("emits promise errors, auto-rolls back, and rejects unsupported bigints", async () => {
        const db = createDb("soft.sqlite", {
            throwErrors: false,
            autoRollback: true
        });
        const errors = [];

        db.on(DatabaseEvents.promiseError, err => errors.push(err.message));

        expect(await db.run("CREATE TABLE Nope (id INTEGER)")).toBeUndefined();

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        await db.exec("CREATE TABLE Ints (value INTEGER) STRICT;");

        const trx = await db.beginTransaction();
        await trx.run("INSERT INTO Items VALUES ('x')");
        expect(await trx.run("INSERT INTO Items VALUES ('x')")).toBeUndefined();
        expect(trx.inTransaction).toBe(false);
        expect((await db.get("SELECT COUNT(*) AS count FROM Items")).count).toBe(0);

        const inserted = await db.run("INSERT INTO Ints VALUES (?)", 12n);
        expect(inserted.changes).toBe(1);
        expect((await db.get("SELECT value FROM Ints")).value).toBe(12);

        await expect(db.run("INSERT INTO Ints VALUES (?)", 2147483648n)).resolves.toBeUndefined();
        expect(await db.get("SELECT * FROM Missing")).toBeUndefined();
        await db.close();

        expect(db.configure("busyTimeout", 1)).toBeUndefined();
        expect(errors.some(message => message.includes("not open"))).toBe(true);
        expect(errors.some(message => message.includes("BigInt parameters"))).toBe(true);
    });

    test("supports each callbacks, nested savepoint rollback, and transaction mode helpers", async () => {
        const db = createDb("nested.sqlite", {
            min: 1,
            max: 2
        });
        const seen = [];

        await db.open();
        await db.exec("CREATE TABLE Items (id INTEGER PRIMARY KEY, value TEXT UNIQUE) STRICT;");
        await db.run("INSERT INTO Items (value) VALUES ('alpha')");
        await db.run("INSERT INTO Items (value) VALUES ('beta')");

        const eachResult = await db.each("SELECT value FROM Items ORDER BY value", [], (_err, row) =>
            seen.push(row.value)
        );

        expect(seen).toEqual(["alpha", "beta"]);
        expect(eachResult._data).toBe(2);

        await db.transactionDeferred(async trx => {
            await trx.run("INSERT INTO Items (value) VALUES ('gamma')");

            await expect(
                trx.transactionExclusive(async nested => {
                    await nested.run("INSERT INTO Items (value) VALUES ('delta')");
                    await nested.run("INSERT INTO Items (value) VALUES ('alpha')");
                })
            ).rejects.toThrow("UNIQUE");

            expect((await trx.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
                "alpha",
                "beta",
                "gamma"
            ]);
        });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma"
        ]);

        await db.transactionExclusive(async trx => {
            await trx.run("INSERT INTO Items (value) VALUES ('omega')");
        });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma",
            "omega"
        ]);
    });

    test("emits pool events and releases manual transaction sessions back to the pool", async () => {
        const db = createDb("events.sqlite", {
            min: 1,
            max: 1
        });
        const poolEvents = [];

        await db.open();

        db.pool.on(PoolEvents.acquire, () => poolEvents.push("acquire"));
        db.pool.on(PoolEvents.release, () => poolEvents.push("release"));

        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        const trx = await db.beginTransaction();
        expect(trx).not.toBe(db);
        expect(db.pool.pool.borrowed).toBe(1);

        const statement = await trx.prepare("INSERT INTO Items (value) VALUES (?)");
        expect(statement._conn).toBe(trx.db);

        await statement.run("held");
        await statement.finalize();
        expect(db.pool.pool.borrowed).toBe(1);

        await expect(db.commit()).rejects.toThrow("Commit the session instead");
        await trx.commit();
        await new Promise(resolve => setImmediate(resolve));
        expect(db.pool.pool.borrowed).toBe(0);
        expect(poolEvents).toContain("acquire");
        expect(poolEvents).toContain("release");
    });

    test("runs parallel transaction sessions on separate pooled connections", async () => {
        const db = createDb("parallel.sqlite", {
            min: 1,
            max: 2
        });

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        const trx1 = await db.beginTransaction("immediate");
        const trx2 = await db.beginTransaction("deferred");

        expect(trx1).not.toBe(trx2);
        expect(trx1.db).not.toBe(trx2.db);
        expect(db.pool.pool.borrowed).toBe(2);

        await trx1.run("INSERT INTO Items (value) VALUES ('alpha')");
        await trx1.commit();
        await trx2.run("INSERT INTO Items (value) VALUES ('beta')");
        await trx2.rollback();
        await new Promise(resolve => setImmediate(resolve));

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["alpha"]);
    });

    test("backs up with progress reporting and ignores invalid progress values", async () => {
        const db = createDb("backup.sqlite");
        const backupPath = path.join(tempDir, "backup-progress.sqlite");
        const progressReports = [];

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT) STRICT;");

        for (let i = 0; i < 20; i++) {
            await db.run("INSERT INTO Items (value) VALUES (?)", `value-${i}`);
        }

        const result = await db.backup(backupPath, {
            pages: 1,
            progress: report => {
                progressReports.push(report);
                return 1;
            }
        });

        expect(result.remainingPages).toBe(0);
        expect(progressReports.length).toBeGreaterThan(0);
        expect(progressReports.every(report => typeof report.totalPages === "number")).toBe(true);

        const invalidProgressResult = await db.backup(path.join(tempDir, "backup-invalid.sqlite"), {
            progress: _ => Number.NaN
        });
        expect(invalidProgressResult.remainingPages).toBe(0);
    });
});
