import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../../../setupGlobals.js";

import SqliteDatabase from "../../../../src/database/drivers/sqlite/SqliteDatabase.js";

let tempDir;
let db;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sqlite-migrate-"));
});

afterEach(async () => {
    if (db?.db != null) {
        await db.close();
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("Sqlite migrations", () => {
    test("applies and replays migrations", async () => {
        const migrationsPath = path.join(tempDir, "migrations");
        const dbPath = path.join(tempDir, "migrate.sqlite");

        await fs.mkdir(migrationsPath, { recursive: true });
        await fs.writeFile(
            path.join(migrationsPath, "001-initial.sql"),
            `
            -- up
            CREATE TABLE Items (value TEXT UNIQUE) STRICT;
            INSERT INTO Items VALUES ('one');
            -- down
            DROP TABLE Items;
            `
        );
        await fs.writeFile(
            path.join(migrationsPath, "002-more.sql"),
            `
            -- up
            INSERT INTO Items VALUES ('two');
            -- down
            DELETE FROM Items WHERE value = 'two';
            `
        );

        db = new SqliteDatabase(dbPath, undefined, {
            enableWALMode: false
        });

        await db.open();
        await db.migrate({ migrationsPath });
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["one", "two"]);

        await db.migrate({
            migrationsPath,
            force: "last"
        });
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["one", "two"]);

        await db.migrate({
            migrationsPath,
            force: 1
        });
        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["one"]);
    });

    test("rejects malformed migration files", async () => {
        const migrationsPath = path.join(tempDir, "bad-migrations");
        const dbPath = path.join(tempDir, "bad.sqlite");

        await fs.mkdir(migrationsPath, { recursive: true });
        await fs.writeFile(
            path.join(migrationsPath, "001-bad.sql"),
            `
            CREATE TABLE Broken (value TEXT);
            `
        );

        db = new SqliteDatabase(dbPath, undefined, {
            enableWALMode: false
        });

        await db.open();
        await expect(
            db.migrate({
                migrationsPath
            })
        ).rejects.toThrow("must contain '-- up' and '-- down' labels");
    });

    test("rolls back applied migrations when files disappear and strips sql comments", async () => {
        const migrationsPath = path.join(tempDir, "comment-migrations");
        const dbPath = path.join(tempDir, "comment.sqlite");

        await fs.mkdir(migrationsPath, { recursive: true });
        await fs.writeFile(
            path.join(migrationsPath, "001-create.sql"),
            `
            -- up
            -- setup
            CREATE TABLE Items (value TEXT UNIQUE) STRICT;
            INSERT INTO Items VALUES ('one');
            -- down
            -- tear down
            DROP TABLE Items;
            `
        );
        await fs.writeFile(
            path.join(migrationsPath, "002-insert.sql"),
            `
            -- up
            -- add second row
            INSERT INTO Items VALUES ('two');
            -- down
            -- remove second row
            DELETE FROM Items WHERE value = 'two';
            `
        );

        db = new SqliteDatabase(dbPath, undefined, {
            enableWALMode: false
        });

        await db.open();
        await db.migrate({ migrationsPath });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["one", "two"]);

        await fs.rm(path.join(migrationsPath, "002-insert.sql"));
        await db.migrate({ migrationsPath });

        expect((await db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual(["one"]);

        const stored = await db.get('SELECT up, down FROM "migrations" WHERE id = 1');
        expect(stored.up).not.toContain("--");
        expect(stored.down).not.toContain("--");
    });
});
