import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import SqlDatabase from "../../src/database/SqlDatabase.js";

class ExampleSqlDatabase extends SqlDatabase {}

let tempDir;
let db;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sql-base-"));
});

afterEach(async () => {
    if (db?.db != null) {
        await db.close();
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("SqlDatabase", () => {
    test("creates, loads, reopens, reads, and unloads query files", async () => {
        const queryDir = path.join(tempDir, "query");
        const nestedDir = path.join(queryDir, "nested");
        const dbPath = path.join(tempDir, "example.sqlite");

        await fs.mkdir(nestedDir, { recursive: true });
        await fs.writeFile(
            path.join(queryDir, "create.sql"),
            `
            CREATE TABLE Items ('value' TEXT) STRICT;
            ---
            CREATE TABLE Extra ('value' TEXT) STRICT;
            `
        );
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES ($value);");
        await fs.writeFile(path.join(nestedDir, "fetch.sql"), "SELECT * FROM Items WHERE value = $value LIMIT 1;");
        await fs.writeFile(path.join(queryDir, "ignore.txt"), "ignored");

        db = new ExampleSqlDatabase(dbPath, queryDir, { enableWAL: false });

        expect(db._isValidQueryPath(path.join(queryDir, "insert.sql"))).toBe(true);
        expect(db._isValidQueryPath(path.join(queryDir, "create.sql"))).toBe(false);
        expect(db._isValidQueryPath(path.join(queryDir, "ignore.txt"))).toBe(false);

        await db.create();
        await db.load();
        await db.open();

        expect(db.createString).toContain("CREATE TABLE Items");
        expect(db.queryStrings.queries.insert).toContain("INSERT INTO Items");
        expect(db.queryStrings.nestedQueries.fetch).toContain("SELECT * FROM Items");

        await db.queries.insert.run({ $value: "alpha" });
        expect((await db.nestedQueries.fetch.get({ $value: "alpha" })).value).toBe("alpha");

        expect(db.queryList.length).toBe(2);
        db._unloadQueries();
        expect(db.queryList).toEqual([]);
        expect(db.queryStrings).toEqual({});
        expect(db.queries).toBeUndefined();
        expect(db.nestedQueries).toBeUndefined();
    });
});
