import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import PermissionDatabase from "../../src/database/PermissionDatabase.js";
import Group from "../../src/structures/permission/Group.js";
import User from "../../src/structures/permission/User.js";

import { OpenModes } from "../../src/database/drivers/sqlite/OpenModes.js";

const permissionQueryPath = path.resolve(projRoot, "src/database/query/permission");
const permissionMigrationsPath = path.resolve(projRoot, "src/database/migrations/permission");

let tempDir;
let openDatabases;

function createPermissionDb(filename = "permissions.sqlite") {
    const dbPath = path.join(tempDir, filename);
    return new PermissionDatabase(dbPath, permissionQueryPath, {
        enableWAL: false,
        migrationsPath: permissionMigrationsPath
    });
}

async function track(db) {
    openDatabases.push(db);
    await db.create();
    await db.load();
    return db;
}

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-db-"));
    openDatabases = [];
});

afterEach(async () => {
    for (const db of openDatabases) {
        if (db.db !== null) {
            await db.close();
        }
    }

    await fs.rm(tempDir, { recursive: true, force: true });
});

describe("PermissionDatabase", () => {
    test("stores, lists, updates, transfers, and removes groups and users", async () => {
        const db = await track(createPermissionDb());
        const member = new Group({ name: "member", level: 1 });
        const mod = new Group({ name: "mod", level: 5 });
        const user = new User({ user: "42" });

        await db.addGroup(member);
        await db.addGroup(mod);

        expect(await db.groupExists("member")).toBe(true);
        expect(await db.groupExists("missing")).toBe(false);
        expect(await db.groupExists(["member", "missing", "mod"])).toEqual([true, false, true]);
        expect(await db.userExists("42")).toBe(false);
        expect(await db.userExists(["42", "99"])).toEqual([false, false]);
        expect(await db.fetchGroup("missing")).toBeNull();
        expect(await db.fetchByLevel(99)).toBeNull();
        expect(await db.fetch("42")).toBeNull();
        expect(await db.fetchGroup("member")).toMatchObject({ name: "member", level: 1 });
        expect(await db.fetchByLevel(5)).toMatchObject({ name: "mod", level: 5 });
        expect((await db.listGroups()).map(group => group.name)).toEqual(["mod", "member"]);

        await db.add(member, user);
        await expect(db.add(member, user)).rejects.toThrow();
        expect(await db.userExists("42")).toBe(true);
        expect((await db.fetch("42")).map(group => group.name)).toEqual(["member"]);
        expect(await db.listUsers()).toEqual([expect.objectContaining({ id: 1, user: "42", group: "member" })]);

        const helper = new Group({ name: "helper", level: 2 });
        await db.updateGroup(member, helper);
        expect((await db.fetch("42")).map(group => group.name)).toEqual(["helper"]);

        const admin = new Group({ name: "admin", level: 10 });
        await db.updateGroup(helper, admin);
        expect(await db.fetchGroup("helper")).toBeNull();
        expect(await db.fetchGroup("admin")).toMatchObject({ name: "admin", level: 10 });
        expect((await db.fetch("42")).map(group => group.name)).toEqual(["admin"]);

        await db.add(admin, new User({ user: "99" }));
        await db.removeGroup(admin);
        expect(await db.fetch("42")).toBeNull();
        expect(await db.fetch("99")).toBeNull();
        expect(await db.userExists(["42", "99"])).toEqual([false, false]);

        await db.addGroup(member);
        await db.add(member, user);
        await db.remove(member, user);
        expect(await db.fetch("42")).toBeNull();

        await db.add(member, user);
        await db.removeAll(user);
        expect(await db.fetch("42")).toBeNull();

        await db.removeGroup(member);
        expect(await db.fetchGroup("member")).toBeNull();
        expect(await db.groupExists([])).toEqual([]);
    });

    test("migrates unconstrained users schema to current schema with unique constraints and foreign keys", async () => {
        const dbPath = path.join(tempDir, "legacy_perm.sqlite"),
            db = new PermissionDatabase(dbPath, permissionQueryPath, {
                enableWAL: false,
                migrationsPath: permissionMigrationsPath
            });
        openDatabases.push(db);

        await db.open(OpenModes.OPEN_RWCREATE);
        await db.db.run("PRAGMA foreign_keys = OFF;");
        await db.db.exec(`
            CREATE TABLE 'Groups' (
                'name' TEXT,
                'level' INTEGER,
                PRIMARY KEY('name')
            ) STRICT;
            CREATE TABLE 'Users' (
                'id' INTEGER,
                'user' TEXT,
                'group' TEXT,
                PRIMARY KEY('id' AUTOINCREMENT),
                FOREIGN KEY('group') REFERENCES Groups('name')
            ) STRICT;
        `);

        await db.db.run("INSERT INTO Groups VALUES ('member', 1);");
        await db.db.run("INSERT INTO Groups VALUES ('mod', 5);");

        await db.db.run("INSERT INTO Users ('user', 'group') VALUES ('42', 'member');");
        await db.db.run("INSERT INTO Users ('user', 'group') VALUES ('42', 'member');");
        await db.db.run("INSERT INTO Users ('user', 'group') VALUES ('99', 'mod');");
        await db.db.run("INSERT INTO Users ('user', 'group') VALUES ('100', 'missing_group');");

        await db.close();

        const loadedDb = new PermissionDatabase(dbPath, permissionQueryPath, {
            enableWAL: false,
            migrationsPath: permissionMigrationsPath
        });
        openDatabases.push(loadedDb);

        await loadedDb.load();

        const users = await loadedDb.listUsers();
        expect(users).toHaveLength(2);
        expect(users.map(u => ({ user: u.user, group: u.group }))).toEqual([
            { user: "42", group: "member" },
            { user: "99", group: "mod" }
        ]);

        await expect(loadedDb.add(new Group({ name: "member", level: 1 }), new User({ user: "42" }))).rejects.toThrow();

        const newGroup = new Group({ name: "regular", level: 2 });
        await loadedDb.updateGroup(new Group({ name: "member", level: 1 }), newGroup);
        expect((await loadedDb.fetch("42")).map(g => g.name)).toEqual(["regular"]);

        const migrationRows = Array.from(await loadedDb.db.all("SELECT id FROM migrations ORDER BY id ASC;")).map(
            row => row.id
        );
        expect(migrationRows).toEqual([1]);

        const revMigrationRows = Array.from(
            await loadedDb.db.all("SELECT id FROM revision_migrations ORDER BY id ASC;")
        ).map(row => row.id);
        expect(revMigrationRows).toEqual([1, 2]);
    });
});
