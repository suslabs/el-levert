import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import QueryLoader from "../../../src/loaders/query/QueryLoader.js";
import DirectoryLoader from "../../../src/loaders/DirectoryLoader.js";

import LoadStatus from "../../../src/loaders/LoadStatus.js";

let tempDir;

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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-query-loader-"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("QueryLoader", () => {
    test("loads create text and grouped query strings from disk", async () => {
        const nestedDir = path.join(tempDir, "nested", "deep");
        const logger = createLogger();
        const rewriteFunc = vi.fn();

        await fs.mkdir(nestedDir, { recursive: true });
        await fs.writeFile(path.join(tempDir, "create.sql"), "CREATE TABLE Items (value TEXT);");
        await fs.writeFile(path.join(tempDir, "insert.sql"), "INSERT INTO Items VALUES ($value);");
        await fs.writeFile(path.join(nestedDir, "fetch.sql"), "SELECT * FROM Items WHERE value = $value;");
        await fs.writeFile(path.join(tempDir, "ignore.txt"), "ignored");

        const loader = new QueryLoader(tempDir, logger, {
            rewriteQueryStrings: rewriteFunc
        });

        await expect(loader.load()).resolves.toEqual([
            {
                queries: {
                    insert: "INSERT INTO Items VALUES ($value);"
                },
                nestedQueries: {
                    fetch: "SELECT * FROM Items WHERE value = $value;"
                }
            },
            LoadStatus.successful
        ]);

        expect(loader.createString).toBe("CREATE TABLE Items (value TEXT);");
        expect(loader.createQueries).toEqual(["CREATE TABLE Items (value TEXT);"]);
        expect(loader.queryStrings).toEqual({
            queries: {
                insert: "INSERT INTO Items VALUES ($value);"
            },
            nestedQueries: {
                fetch: "SELECT * FROM Items WHERE value = $value;"
            }
        });
        expect(loader.queries).toEqual(loader.queryStrings);
        expect(rewriteFunc).not.toHaveBeenCalled();
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded query: create");
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded query: insert");
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded query: fetch");
    });

    test("rewrites query strings, prepares statements, and finalizes them on delete", async () => {
        const tagDir = path.join(tempDir, "tag");
        const logger = createLogger();
        const finalizeCalls = [];
        const prepareCalls = [];
        const statements = [];

        await fs.mkdir(tagDir, { recursive: true });
        await fs.writeFile(
            path.join(tempDir, "create.sql"),
            `
            CREATE TABLE Tags (aliasName TEXT);
            ---
            CREATE TABLE TagUsage (name TEXT);
            `
        );
        await fs.writeFile(path.join(tagDir, "fetch.sql"), "SELECT aliasName FROM Tags;");
        await fs.writeFile(path.join(tagDir, "update.sql"), "UPDATE Tags SET aliasName = $aliasName;");

        const db = {
            prepare: vi.fn(async sql => {
                prepareCalls.push(sql);

                const statement = {
                    finalized: false,
                    sql,
                    finalize: vi.fn(async () => {
                        statement.finalized = true;
                        finalizeCalls.push(sql);
                    })
                };

                statements.push(statement);
                return statement;
            })
        };

        const rewriteFunc = vi.fn(queryStrings => {
            const rewritten = structuredClone(queryStrings);

            for (const [name, query] of Object.entries(rewritten.tagQueries)) {
                rewritten.tagQueries[name] = query.replaceAll("aliasName", "hops");
            }

            return rewritten;
        });

        const loader = new QueryLoader(tempDir, logger, {
            db,
            rewriteQueryStrings: rewriteFunc
        });

        const [queries, status] = await loader.load();

        expect(status).toBe(LoadStatus.successful);
        expect(loader.createQueries).toEqual([
            "CREATE TABLE Tags (aliasName TEXT);",
            "CREATE TABLE TagUsage (name TEXT);"
        ]);
        expect(rewriteFunc).toHaveBeenCalledWith({
            tagQueries: {
                fetch: "SELECT aliasName FROM Tags;",
                update: "UPDATE Tags SET aliasName = $aliasName;"
            }
        });
        expect(loader.queryStrings).toEqual({
            tagQueries: {
                fetch: "SELECT hops FROM Tags;",
                update: "UPDATE Tags SET hops = $hops;"
            }
        });
        expect(prepareCalls).toEqual([
            "SELECT hops FROM Tags;",
            "UPDATE Tags SET hops = $hops;"
        ]);
        expect(queries.tagQueries.fetch).toBe(statements[0]);
        expect(queries.tagQueries.update).toBe(statements[1]);
        expect(loader.queryList).toEqual(statements);

        await loader.deleteQueries();

        expect(finalizeCalls).toEqual([
            "SELECT hops FROM Tags;",
            "UPDATE Tags SET hops = $hops;"
        ]);
        expect(logger.debug).toHaveBeenCalledWith("Deleting queries...");
        expect(logger.debug).toHaveBeenCalledWith("Deleted 2 queries.");
        expect(loader.queries).toBeUndefined();
        expect(loader.queryStrings).toBeUndefined();
        expect(loader.createString).toBeUndefined();
        expect(loader.createQueries).toBeUndefined();
    });
});

describe("Merged Branch Coverage", () => {
    describe("QueryLoader branches", () => {
        test("returns failed loads immediately and exposes loading messages", async () => {
            const loader = new QueryLoader(".", null);
            const loadSpy = vi.spyOn(DirectoryLoader.prototype, "load").mockResolvedValue(LoadStatus.failed);

            await expect(loader.load()).resolves.toEqual([null, LoadStatus.failed]);
            expect(loader.getPluralName()).toBe("queries");
            expect(loader.getLoadingMessage()).toBe("Loading queries...");
            expect(loader.getLoadedMessage()).toBe("Loaded queries successfully.");

            loadSpy.mockRestore();
        });
    });
});
