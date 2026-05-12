import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../../setupGlobals.js";

import MigrationLoader from "../../../src/loaders/migration/MigrationLoader.js";

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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-migration-loader-"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("MigrationLoader", () => {
    test("loads and sorts parsed migrations from disk", async () => {
        const logger = createLogger();

        await fs.writeFile(
            path.join(tempDir, "002-more.sql"),
            `
            -- up
            INSERT INTO Items VALUES ('two');
            -- down
            DELETE FROM Items WHERE value = 'two';
            `
        );
        await fs.writeFile(
            path.join(tempDir, "001-initial.sql"),
            `
            -- up
            -- setup
            CREATE TABLE Items (value TEXT UNIQUE) STRICT;
            -- down
            -- teardown
            DROP TABLE Items;
            `
        );

        const loader = new MigrationLoader(tempDir, logger);
        const [migrations, status] = await loader.load();

        expect(status).toBe(LoadStatus.successful);
        expect(migrations).toEqual([
            {
                id: 1,
                name: "initial",
                filename: "001-initial.sql",
                up: "CREATE TABLE Items (value TEXT UNIQUE) STRICT;",
                down: "DROP TABLE Items;"
            },
            {
                id: 2,
                name: "more",
                filename: "002-more.sql",
                up: "INSERT INTO Items VALUES ('two');",
                down: "DELETE FROM Items WHERE value = 'two';"
            }
        ]);
        expect(loader.migrations).toEqual(migrations);
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded migration: 001-initial");
        expect(logger.log).toHaveBeenCalledWith("info", "Loaded migration: 002-more");
    });

    test("rejects malformed migration files", async () => {
        const logger = createLogger();

        await fs.writeFile(
            path.join(tempDir, "001-bad.sql"),
            `
            CREATE TABLE Broken (value TEXT);
            `
        );

        const loader = new MigrationLoader(tempDir, logger);

        await expect(loader.load()).rejects.toThrow("must contain '-- up' and '-- down' labels");
    });
});
