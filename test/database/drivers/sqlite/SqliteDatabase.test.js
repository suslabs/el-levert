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
        expect(() => db.open()).toThrow("The database is open");

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

        const tx1 = await db.beginTransaction();
        await tx1.run("INSERT INTO Items (value) VALUES ('gamma')");
        await tx1.rollback();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta"
        ]);

        const tx2 = await db.beginTransaction();
        await tx2.run("INSERT INTO Items (value) VALUES ('gamma')");
        await tx2.commit();
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma"
        ]);

        await db.transactionImmediate(async tx => {
            await tx.run("INSERT INTO Items (value) VALUES ('delta')");

            try {
                await tx.transactionImmediate(async nested => {
                    await nested.run("INSERT INTO Items (value) VALUES ('epsilon')");
                    await nested.run("INSERT INTO Items (value) VALUES ('alpha')");
                });
            } catch (err) {
                expect(err.message).toContain("UNIQUE");
            }

            await tx.run("INSERT INTO Items (value) VALUES ('zeta')");
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
        expect((await db.tableInfo("Items")).map(row => row.name)).toEqual(["id", "value"]);
        expect((await db.tableXInfo("Items")).map(row => row.name)).toEqual(["id", "value"]);
        expect(await db.tableSchema("Items")).toMatchObject({
            base: new Set(["id", "value"]),
            extended: new Set(["id", "value"]),
            baseColumns: new Map([
                ["id", expect.objectContaining({ name: "id" })],
                ["value", expect.objectContaining({ name: "value" })]
            ]),
            extendedColumns: new Map([
                ["id", expect.objectContaining({ name: "id" })],
                ["value", expect.objectContaining({ name: "value" })]
            ])
        });
        expect(await db.tableExists("Items")).toBe(true);

        const tableDetails = await db.tableDetails("Items"),
            uniqueIndex = tableDetails.indexes.find(index => index.unique === 1);

        expect(tableDetails.exists).toBe(true);
        expect(tableDetails.foreignKeys).toEqual([]);
        expect(tableDetails.indexColumns.get(uniqueIndex.name).map(row => row.name)).toEqual(["value"]);
        await db.exec('CREATE TABLE "Quoted""Items" (id INTEGER PRIMARY KEY) STRICT;');
        expect((await db.tableInfo('Quoted"Items')).map(row => row.name)).toEqual(["id"]);
        expect(await db.tableInfo("Items; DROP TABLE Items")).toEqual([]);
        expect(await db.tableExists("Items")).toBe(true);
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

    test("emits promise errors, auto-rolls back, and supports native bigints", async () => {
        const db = createDb("soft.sqlite", {
            throwErrors: false,
            autoRollback: true
        });
        const errors = [];
        const big = 9223372036854775807n;
        let customArgType = null;

        db.on(DatabaseEvents.promiseError, err => errors.push(err.message));

        expect(await db.run("CREATE TABLE Nope (id INTEGER)")).toBeUndefined();

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        await db.exec("CREATE TABLE Ints (value INTEGER) STRICT;");

        const tx = await db.beginTransaction();
        await tx.run("INSERT INTO Items VALUES ('x')");
        expect(await tx.run("INSERT INTO Items VALUES ('x')")).toBeUndefined();
        expect(tx.inTransaction).toBe(false);
        expect((await db.get("SELECT COUNT(*) AS count FROM Items")).count).toBe(0);

        const inserted = await db.run("INSERT INTO Ints VALUES (?)", 2147483648n);
        expect(inserted.changes).toBe(1);
        expect((await db.get("SELECT value FROM Ints")).value).toBe(2147483648);

        await expect(db.run("INSERT INTO Ints VALUES (?)", big)).resolves.toBeDefined();
        await db.defaultSafeIntegers();

        expect((await db.get("SELECT value FROM Ints WHERE value = ?", big)).value).toBe(big);

        await db.exec("CREATE TABLE RowIds (id INTEGER PRIMARY KEY, value TEXT) STRICT;");
        expect((await db.run("INSERT INTO RowIds (id, value) VALUES (?, ?)", big - 1n, "x")).lastID).toBe(big - 1n);

        await db.createFunction("echo_int", value => {
            customArgType = typeof value;
            return value;
        });
        expect((await db.get("SELECT echo_int(?) AS value", big)).value).toBe(big);
        expect(customArgType).toBe("bigint");

        await expect(db.run("INSERT INTO Ints VALUES (?)", 9223372036854775808n)).resolves.toBeUndefined();
        expect(await db.get("SELECT * FROM Missing")).toBeUndefined();
        await db.close();

        expect(db.configure("busyTimeout", 1)).toBeUndefined();
        expect(errors.some(message => message.includes("not open"))).toBe(true);
        expect(errors.some(message => message.includes("BigInt value is too large"))).toBe(true);
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

        await db.transactionDeferred(async tx => {
            await tx.run("INSERT INTO Items (value) VALUES ('gamma')");

            await expect(
                tx.transactionExclusive(async nested => {
                    await nested.run("INSERT INTO Items (value) VALUES ('delta')");
                    await nested.run("INSERT INTO Items (value) VALUES ('alpha')");
                })
            ).rejects.toThrow("UNIQUE");

            expect((await tx.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
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

        await db.transactionExclusive(async tx => {
            await tx.run("INSERT INTO Items (value) VALUES ('omega')");
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
        const tx = await db.beginTransaction();
        expect(tx).not.toBe(db);
        expect(db.pool.pool.borrowed).toBe(1);

        const st = await tx.prepare("INSERT INTO Items (value) VALUES (?)");
        expect(st._conn).toBe(tx.db);

        await st.run("held");
        await st.finalize();
        expect(db.pool.pool.borrowed).toBe(1);

        await expect(db.commit()).rejects.toThrow("Commit the session instead");
        await tx.commit();
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

        const tx1 = await db.beginTransaction("immediate");
        const tx2 = await db.beginTransaction("deferred");

        expect(tx1).not.toBe(tx2);
        expect(tx1.db).not.toBe(tx2.db);
        expect(db.pool.pool.borrowed).toBe(2);

        await tx1.run("INSERT INTO Items (value) VALUES ('alpha')");
        await tx1.commit();
        await tx2.run("INSERT INTO Items (value) VALUES ('beta')");
        await tx2.rollback();
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

    test("routes promise-facing sqlite errors once when throwing is disabled", async () => {
        const db = createDb("soft-routing.sqlite", {
            throwErrors: false
        });
        const errors = [];

        db.on(DatabaseEvents.promiseError, err => errors.push(err.message));

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT) STRICT;");
        await db.run("INSERT INTO Items (value) VALUES ('alpha')");

        expect(await db.tableInfo("Items; DROP TABLE Items")).toEqual([]);
        expect(await db.tableExists("Items")).toBe(true);

        errors.length = 0;
        expect(await db.commit()).toBe(db);
        expect(errors.filter(message => message.includes("Commit the session instead")).length).toBe(1);

        errors.length = 0;
        expect(
            await db.backup(path.join(tempDir, "backup-progress-error.sqlite"), {
                pages: 1,
                progress: _ => {
                    throw new Error("progress failed");
                }
            })
        ).toBeUndefined();
        expect(errors.filter(message => message.includes("progress failed")).length).toBe(1);
    });
});
