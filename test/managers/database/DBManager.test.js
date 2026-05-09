import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let ExampleDBManager;
let TagDatabase;
let manager;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    TagDatabase = (await import("../../../src/database/TagDatabase.js")).default;
    const DBManager = (await import("../../../src/managers/database/DBManager.js")).default;

    ExampleDBManager = class ExampleDBManager extends DBManager {
        static $name = "exampleDBManager";

        constructor(enabled = true) {
            super(enabled, "tag", "tag_db", TagDatabase);
        }
    };
});

afterEach(async () => {
    await manager?.unload?.();
    await cleanupRuntime(runtime);
});

describe("DBManager", () => {
    test("creates, loads, checks, and unloads a real database", async () => {
        const infoSpy = vi.spyOn(runtime.client.logger, "info").mockImplementation(() => runtime.client.logger);

        manager = new ExampleDBManager(true);

        expect(await manager.checkDatabase()).toBe(false);
        await manager.load();
        expect(await manager.checkDatabase()).toBe(true);
        expect(manager.tag_db).toBeInstanceOf(TagDatabase);
        expect(manager._dbPath).toBe(path.resolve(projRoot, runtime.tempDir, "tag_db.db"));
        expect(manager._queryDir).toBe(path.resolve(projRoot, "src/database/query/tag"));

        await manager.unload();
        expect(manager.tag_db).toBeUndefined();
        manager = null;
        expect(infoSpy).toHaveBeenCalled();
    });
});
