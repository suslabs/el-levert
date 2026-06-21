import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sqlite-st-"));
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

describe("SqliteStatement", () => {
    test("keeps root statement containers unbound while child connections own bound copies", async () => {
        const db = createDb("stmt-root.sqlite", {
            min: 1,
            max: 2
        });

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        const insert = await db.prepare("INSERT INTO Items (value) VALUES (?)"),
            fetch = await db.prepare("SELECT value FROM Items WHERE value = ? LIMIT 1;");

        expect(db.statements).toEqual([insert, fetch]);
        expect(insert._statements.size).toBe(1);

        await insert.run("alpha");
        await insert.run("beta");

        expect(insert._statements.size).toBe(1);
        expect((await fetch.get("alpha")).value).toBe("alpha");
        expect(db.pool.pool.borrowed).toBe(0);

        const tx1 = await db.beginTransaction("immediate"),
            tx2 = await db.beginTransaction("deferred"),
            txInsert1 = await tx1.bindStatement(insert),
            txInsert2 = await tx2.bindStatement(insert);

        expect(txInsert1).not.toBe(txInsert2);
        expect(txInsert1._conn).toBe(tx1.db);
        expect(txInsert2._conn).toBe(tx2.db);
        expect(insert._statements.size).toBe(2);

        await txInsert1.run("gamma");
        await tx1.commit();

        await txInsert2.run("delta");
        await tx2.rollback();

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta",
            "gamma"
        ]);
    });

    test("finalizes root copies across child connections and auto-finalizes session-local statements", async () => {
        const db = createDb("stmt-finalize.sqlite", {
            min: 1,
            max: 2
        });

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        const insert = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await insert.run("alpha");

        const tx = await db.beginTransaction(),
            txInsert = await tx.bindStatement(insert),
            local = await tx.prepare("INSERT INTO Items (value) VALUES (?)");

        await txInsert.run("beta");
        await local.run("gamma");

        await insert.finalize();

        expect(insert.finalized).toBe(true);
        expect(txInsert.finalized).toBe(true);
        expect(db.statements.includes(insert)).toBe(false);

        await tx.rollback();
        expect(local.finalized).toBe(true);
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["alpha"]);
    });

    test("supports bigint params and safe integer reads on root containers and bound child copies", async () => {
        const db = createDb("stmt-bigint.sqlite");
        const big = 9223372036854775807n;

        await db.open();
        await db.exec("CREATE TABLE Items (value INTEGER, alt INTEGER) STRICT;");

        const insert = await db.prepare("INSERT INTO Items (value, alt) VALUES (?, ?)");
        await insert.run(1n, big);

        const select = await db.prepare("SELECT alt FROM Items WHERE value = ?");
        select.safeIntegers();
        expect((await select.get(1n)).alt).toBe(big);

        const tx = await db.beginTransaction(),
            txSelect = await tx.bindStatement(select);

        expect((await txSelect.get(1n)).alt).toBe(big);
        await tx.rollback();
    });
});
