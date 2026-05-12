import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import sqlite from "sqlite3";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../../../setupGlobals.js";

import SqliteDatabase from "../../../../src/database/drivers/sqlite/SqliteDatabase.js";
import PoolEvents from "../../../../src/database/drivers/sqlite/PoolEvents.js";

let tempDir;
let dbs;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-sqlite-pool-"));
    dbs = [];
});

afterEach(async () => {
    vi.restoreAllMocks();

    for (const db of dbs) {
        if (db.db != null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("SqlitePool", () => {
    test("forces a single pooled connection for memory databases", async () => {
        const db = new SqliteDatabase(":memory:", undefined, {
            min: 3,
            max: 5,
            enableWALMode: false
        });
        dbs.push(db);

        await db.open();

        expect(db.pool.options.min).toBe(1);
        expect(db.pool.options.max).toBe(1);
    });

    test("loads configured extensions for created pooled connections", async () => {
        const loadExtension = vi
            .spyOn(sqlite.Database.prototype, "loadExtension")
            .mockImplementation(function loadExtensionMock(extensionPath, callback) {
                callback?.(null);
                return this;
            });
        const extensionPath = path.join(tempDir, "mock-ext");
        const db = new SqliteDatabase(path.join(tempDir, "ext.sqlite"), undefined, {
            loadExtensions: [extensionPath],
            min: 1,
            max: 2,
            enableWALMode: false
        });
        dbs.push(db);

        await db.open();

        const first = await db.pool.acquire();
        const second = await db.pool.acquire();
        first.release();
        second.release();

        expect(loadExtension).toHaveBeenCalledTimes(2);
        expect(loadExtension).toHaveBeenNthCalledWith(1, path.resolve(extensionPath), expect.any(Function));

        await db.loadExtension(path.join(tempDir, "later-ext"));
        expect(db._extensionPaths.has(path.resolve(path.join(tempDir, "later-ext")))).toBe(true);
    });

    test("emits acquire and release events and applies config to existing connections", async () => {
        const db = new SqliteDatabase(path.join(tempDir, "pool-events.sqlite"), undefined, {
            min: 1,
            max: 2,
            enableWALMode: false
        });
        const events = [];
        dbs.push(db);

        await db.open();

        db.pool.on(PoolEvents.acquire, connection => events.push(["acquire", connection.eventName]));
        db.pool.on(PoolEvents.release, connection => events.push(["release", connection.eventName]));

        const connection = await db.pool.acquire();
        expect(db.pool.connections.has(connection)).toBe(true);

        db.pool.applyConfig({
            busyTimeout: 25,
            transactionMode: "exclusive"
        });

        expect(connection.busyTimeout).toBe(25);
        expect(connection.transactionMode).toBe("exclusive");

        connection.release();
        await new Promise(resolve => setImmediate(resolve));

        expect(events.map(([name]) => name)).toEqual(["acquire", "release"]);
    });
});
