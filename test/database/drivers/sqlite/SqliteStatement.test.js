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
        if (db.db != null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("SqliteStatement", () => {
    test("binds, resets, executes, queries, and finalizes real prepared statements", async () => {
        const db = createDb("stmt.sqlite");

        await db.open();
        await db.exec("CREATE TABLE Items (id INTEGER PRIMARY KEY, value TEXT UNIQUE) STRICT;");

        const insert = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await insert.bind("alpha");
        await insert.run();
        await insert.reset();
        await insert.run("beta");

        const selectOne = await db.prepare("SELECT value FROM Items WHERE value = ?");
        expect((await selectOne.get("alpha")).value).toBe("alpha");

        const selectAll = await db.prepare("SELECT value FROM Items ORDER BY value");
        expect((await selectAll.all()).map(row => row.value)).toEqual(["alpha", "beta"]);

        await db.finalizeStatement(selectOne);
        expect(selectOne.finalized).toBe(true);

        await insert.finalize();
        expect(insert.finalized).toBe(true);
        expect(db.statements.includes(insert)).toBe(false);

        expect(selectAll._checkFinalizedSync(false)).toBe(true);
        await selectAll.finalize();
        expect(selectAll._checkFinalizedSync(true)).toBe(true);

        await db.finalizeAll();
    });

    test("covers finalized guards and statement-level rollback handling", async () => {
        const db = createDb("stmt-soft.sqlite", {
            throwErrors: false,
            autoRollback: true
        });

        await db.open();
        await db.exec("CREATE TABLE Items (value TEXT UNIQUE) STRICT;");

        const insert = await db.prepare("INSERT INTO Items (value) VALUES (?)");
        await db.beginTransaction();
        await insert.run("x");
        expect(await insert.run("x")).toBeUndefined();
        expect(db.inTransaction).toBe(false);
        expect((await db.get("SELECT COUNT(*) AS count FROM Items")).count).toBe(0);

        await insert.finalize();
        expect(await insert.bind("again")).toBeUndefined();
        expect(await insert.reset()).toBeUndefined();
        expect(await insert.run("again")).toBeUndefined();
        expect(await insert.get("again")).toBeUndefined();
        expect(await insert.all("again")).toBeUndefined();
        expect(await insert.each("again")).toBeUndefined();
        expect(await insert.finalize()).toBeUndefined();

        expect(insert._checkFinalizedSync(false)).toBe(false);
        expect(() => {
            db.throwErrors = true;
            insert._checkFinalizedSync(false);
        }).toThrow("The statement is finalized");
    });
});
