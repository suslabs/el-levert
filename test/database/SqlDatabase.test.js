import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../setupGlobals.js";

import SqlDatabase from "../../src/database/SqlDatabase.js";
import DirectoryLoader from "../../src/loaders/DirectoryLoader.js";

class ExampleSqlDatabase extends SqlDatabase {}

class SetupSqlDatabase extends SqlDatabase {
    constructor(dbPath, queryPath, options) {
        const customFunctions = new Map(options?.customFunctions ?? []);

        customFunctions.set("double:1", {
            name: "double",
            callback: value => value * 2,
            argc: 1,
            deterministic: true
        });

        super(dbPath, queryPath, {
            ...options,
            customFunctions
        });

        this.setupCalls = [];
    }

    async setup(mode) {
        this.setupCalls.push(mode);
    }
}

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

    await fs.rm(tempDir, {
        recursive: true,
        force: true
    });
});

describe("SqlDatabase", () => {
    test("creates, loads, proxies categories into transactions, and unloads query files", async () => {
        const queryDir = path.join(tempDir, "query");
        const nestedDir = path.join(queryDir, "nested", "deep");
        const dbPath = path.join(tempDir, "example.sqlite");

        await fs.mkdir(nestedDir, {
            recursive: true
        });
        await fs.writeFile(path.join(queryDir, "create.sql"), "CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES (?);");
        await fs.writeFile(path.join(nestedDir, "fetch.sql"), "SELECT value FROM Items WHERE value = ? LIMIT 1;");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMax: 2
        });

        await db.create();
        await db.load();

        expect(db._queryLoaders.get(db.queryPath).queryStrings.queries.insert).toContain("INSERT INTO Items");
        expect(db._queryLoaders.get(db.queryPath).queryStrings.nestedQueries.fetch).toContain(
            "SELECT value FROM Items"
        );

        await db.queries.insert.run("alpha");
        expect((await db.nestedQueries.fetch.get("alpha")).value).toBe("alpha");

        await db.transactionImmediate(async tx => {
            expect(tx.queries.insert).not.toBe(db.queries.insert);
            expect(tx.nestedQueries.fetch).not.toBe(db.nestedQueries.fetch);

            await tx.queries.insert.run("beta");
            expect((await tx.nestedQueries.fetch.get("beta")).value).toBe("beta");
            expect(tx.queries.insert._conn).toBe(tx.db.db);
        });

        expect((await db.db.all("SELECT value FROM Items ORDER BY value")).map(row => row.value)).toEqual([
            "alpha",
            "beta"
        ]);

        await db._unloadDatabase();
        expect(db._queryLoaders.get(db.queryPath)).toBeNull();
        expect(db.queries).toBeUndefined();
        expect(db.nestedQueries).toBeUndefined();
    });

    test("reuses the loaded query data between create and load and reloads cleanly after vacuum", async () => {
        const queryDir = path.join(tempDir, "query-once");
        const dbPath = path.join(tempDir, "once.sqlite");
        const loadPathsSpy = vi.spyOn(DirectoryLoader, "listFilesRecursiveAsync");

        await fs.mkdir(queryDir, {
            recursive: true
        });
        await fs.writeFile(
            path.join(queryDir, "create.sql"),
            `
            CREATE TABLE Items (value TEXT) STRICT;
            ---
            CREATE TABLE Extra (value TEXT) STRICT;
            `
        );
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES (?);");
        await fs.writeFile(path.join(queryDir, "fetch.sql"), "SELECT value FROM Items WHERE value = ? LIMIT 1;");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMax: 1
        });

        await db.create();
        await db.load();

        expect(loadPathsSpy).toHaveBeenCalledTimes(1);
        expect(db._queryLoaders.get(db.queryPath).createQueries).toEqual([
            "CREATE TABLE Items (value TEXT) STRICT;",
            "CREATE TABLE Extra (value TEXT) STRICT;"
        ]);

        await db.queries.insert.run("alpha");
        const beforeLoader = db._queryLoaders.get(db.queryPath);

        await db.vacuum();

        expect(db._queryLoaders.get(db.queryPath)).not.toBeNull();
        expect(db._queryLoaders.get(db.queryPath)).not.toBe(beforeLoader);
        expect((await db.queries.fetch.get("alpha")).value).toBe("alpha");
    });

    test("runs setup hooks and copies configured sql functions into root and pinned transactions", async () => {
        const queryDir = path.join(tempDir, "query-setup");
        const dbPath = path.join(tempDir, "setup.sqlite");

        await fs.mkdir(queryDir, {
            recursive: true
        });
        await fs.writeFile(path.join(queryDir, "create.sql"), "CREATE TABLE Items (value INTEGER) STRICT;");
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES ($value);");

        db = new SetupSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMax: 2
        });

        await db.create();
        await db.load();

        expect(db.setupCalls).toEqual(["create", "load"]);
        expect((await db.db.get("SELECT double(21) AS value;")).value).toBe(42);

        await db.transactionImmediate(async tx => {
            expect((await tx.db.get("SELECT double(21) AS value;")).value).toBe(42);
        });
    });

    test("keeps proxied categories isolated across intersecting pinned transactions", async () => {
        const queryDir = path.join(tempDir, "query-parallel");
        const dbPath = path.join(tempDir, "parallel.sqlite");

        await fs.mkdir(queryDir, {
            recursive: true
        });
        await fs.writeFile(path.join(queryDir, "create.sql"), "CREATE TABLE Items (value TEXT UNIQUE) STRICT;");
        await fs.writeFile(path.join(queryDir, "insert.sql"), "INSERT INTO Items VALUES (?);");
        await fs.writeFile(path.join(queryDir, "list.sql"), "SELECT value FROM Items ORDER BY value;");

        db = new ExampleSqlDatabase(dbPath, queryDir, {
            enableWAL: false,
            poolMin: 1,
            poolMax: 2
        });

        await db.create();
        await db.load();

        const tx1 = await db.beginTransaction("immediate"),
            tx2 = await db.beginTransaction("deferred");

        expect(tx1.queries.insert).not.toBe(tx2.queries.insert);
        expect(tx1.queries.insert._conn).not.toBe(tx2.queries.insert._conn);

        await tx1.queries.insert.run("alpha");
        await tx1.commit();

        await tx2.queries.insert.run("beta");
        await tx2.rollback();

        expect((await db.queries.list.all()).map(row => row.value)).toEqual(["alpha"]);
    });

    test("loads and scopes queries across multiple registered query paths", async () => {
        const primaryDir = path.join(tempDir, "query-primary"),
            secondaryDir = path.join(tempDir, "query-secondary"),
            dbPath = path.join(tempDir, "multi-path.sqlite");

        await fs.mkdir(path.join(primaryDir, "primary"), { recursive: true });
        await fs.mkdir(path.join(secondaryDir, "secondary"), { recursive: true });

        await fs.writeFile(path.join(primaryDir, "create.sql"), "CREATE TABLE PrimaryItems (val TEXT) STRICT;");
        await fs.writeFile(path.join(primaryDir, "primary", "insert.sql"), "INSERT INTO PrimaryItems VALUES (?);");

        await fs.writeFile(path.join(secondaryDir, "create.sql"), "CREATE TABLE SecondaryItems (val TEXT) STRICT;");
        await fs.writeFile(
            path.join(secondaryDir, "secondary", "insert.sql"),
            "INSERT INTO SecondaryItems VALUES (?);"
        );

        class MultiSqlDatabase extends SqlDatabase {
            constructor(dbPath, queryPath, options) {
                super(dbPath, queryPath, options);
                this._registerQueryPath(secondaryDir);
            }
        }

        db = new MultiSqlDatabase(dbPath, primaryDir, { enableWAL: false });
        await db.create();
        await db.load();

        expect(db._getQueryLoaders()).toHaveLength(2);

        await db.primaryQueries.insert.run("p1");
        await db.secondaryQueries.insert.run("s1");

        expect(await db.db.get("SELECT val FROM PrimaryItems")).toEqual({ val: "p1" });
        expect(await db.db.get("SELECT val FROM SecondaryItems")).toEqual({ val: "s1" });

        await db.transactionImmediate(async tx => {
            await tx.primaryQueries.insert.run("p2");
            await tx.secondaryQueries.insert.run("s2");
        });

        expect((await db.db.all("SELECT val FROM PrimaryItems ORDER BY val")).map(r => r.val)).toEqual(["p1", "p2"]);
        expect((await db.db.all("SELECT val FROM SecondaryItems ORDER BY val")).map(r => r.val)).toEqual(["s1", "s2"]);

        await db._unloadDatabase();
        expect(db._getQueryLoaders()).toEqual([]);
    });
});
