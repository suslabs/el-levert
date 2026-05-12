import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../setupGlobals.js";

import SqlDatabase from "../../src/database/SqlDatabase.js";
import DirectoryLoader from "../../src/loaders/DirectoryLoader.js";

class ExampleSqlDatabase extends SqlDatabase {}

let tempDir;
let db;

function createLogger() {
    return {
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        log: vi.fn()
    };
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sql-base-"));
});

afterEach(async () => {
    vi.restoreAllMocks();

    if (db?.db != null) {
        await db.close();
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("SqlDatabase", () => {
    test("creates, loads, binds prepared statements, migrates, and unloads query files", async () => {
        const queryDir = path.join(tempDir, "query");
        const nestedDir = path.join(queryDir, "nested", "deep");
        const migrationDir = path.join(tempDir, "migrations");
        const dbPath = path.join(tempDir, "example.sqlite");

        await fs.mkdir(nestedDir, { recursive: true });
        await fs.mkdir(migrationDir, { recursive: true });
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
        await fs.writeFile(
            path.join(migrationDir, "001-extra.sql"),
            `
            -- up
            CREATE TABLE MigrationData (value TEXT) STRICT;
            INSERT INTO MigrationData VALUES ('up');
            -- down
            DROP TABLE MigrationData;
            `
        );

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMax: 1
        });

        await db.create();
        await db.load();
        await db.open();

        expect(db._queryLoader.createString).toContain("CREATE TABLE Items");
        expect(db._queryLoader.queryStrings.queries.create).toBeUndefined();
        expect(db._queryLoader.queryStrings.queries.insert).toContain("INSERT INTO Items");
        expect(db._queryLoader.queryStrings.nestedQueries.fetch).toContain("SELECT * FROM Items");
        expect(db._queryLoader.queryList.length).toBe(2);
        expect(db.db.pool.pool.borrowed).toBe(0);

        await db.queries.insert.run({ $value: "alpha" });
        expect((await db.nestedQueries.fetch.get({ $value: "alpha" })).value).toBe("alpha");
        expect(db.db.pool.pool.borrowed).toBe(0);

        await db.migrate({
            migrationsPath: migrationDir
        });
        expect((await db.db.get("SELECT value FROM MigrationData LIMIT 1")).value).toBe("up");

        await db._unloadDatabase();
        expect(db._queryLoader).toBeNull();
        expect(db.queries).toBeUndefined();
        expect(db.nestedQueries).toBeUndefined();
    });

    test("keeps prepared query statements reusable without pinning the pool", async () => {
        const queryDir = path.join(tempDir, "query-reuse");
        const dbPath = path.join(tempDir, "reuse.sqlite");

        await fs.mkdir(queryDir, { recursive: true });
        await fs.writeFile(path.join(queryDir, "create.sql"), "CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES (?);");
        await fs.writeFile(path.join(queryDir, "fetch.sql"), "SELECT value FROM Items WHERE value = ? LIMIT 1;");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMin: 1,
            poolMax: 1
        });

        await db.create();
        await db.load();

        expect(db.db.pool.pool.borrowed).toBe(0);

        await db.queries.insert.run("alpha");
        await db.queries.insert.run("beta");
        expect(db.db.pool.pool.borrowed).toBe(0);

        const directStatement = db.queries.fetch;
        expect(db.db.pool.pool.borrowed).toBe(0);
        expect((await directStatement.get("alpha")).value).toBe("alpha");
        expect(db.db.pool.pool.borrowed).toBe(0);
        expect((await db.queries.fetch.get("beta")).value).toBe("beta");
    });

    test("reuses the loaded query loader between create and load", async () => {
        const queryDir = path.join(tempDir, "query-once");
        const dbPath = path.join(tempDir, "once.sqlite");
        const loadPathsSpy = vi.spyOn(DirectoryLoader, "listFilesRecursiveAsync");

        await fs.mkdir(queryDir, { recursive: true });
        await fs.writeFile(
            path.join(queryDir, "create.sql"),
            `
            CREATE TABLE Items (value TEXT) STRICT;
            ---
            CREATE TABLE Extra (value TEXT) STRICT;
            `
        );
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES (?);");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMax: 1
        });

        await db.create();
        await db.load();

        expect(loadPathsSpy).toHaveBeenCalledTimes(1);
        expect(db._queryLoader.createQueries).toEqual([
            "CREATE TABLE Items (value TEXT) STRICT;",
            "CREATE TABLE Extra (value TEXT) STRICT;"
        ]);
    });

    test("passes the database logger through to the query loader", async () => {
        const queryDir = path.join(tempDir, "query-logs");
        const dbPath = path.join(tempDir, "logs.sqlite");
        const logger = createLogger();

        await fs.mkdir(queryDir, { recursive: true });
        await fs.writeFile(path.join(queryDir, "create.sql"), "CREATE TABLE Items (value TEXT) STRICT;");
        await fs.writeFile(path.join(queryDir, "fetch.sql"), "SELECT value FROM Items LIMIT 1;");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            logger,
            enableWAL: false,
            poolMax: 1
        });

        await db.create();
        await db.load();

        expect(logger.debug).toHaveBeenCalledWith("Loading queries...");
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded queries successfully.");
    });
});
