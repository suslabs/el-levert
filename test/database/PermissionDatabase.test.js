import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import "../../setupGlobals.js";

import PermissionDatabase from "../../src/database/PermissionDatabase.js";
import Group from "../../src/structures/permission/Group.js";
import User from "../../src/structures/permission/User.js";

const permissionQueryPath = path.resolve(projRoot, "src/database/query/permission");

let tempDir;
let openDatabases;

function createPermissionDb(filename = "permissions.sqlite") {
    const dbPath = path.join(tempDir, filename);
    return new PermissionDatabase(dbPath, permissionQueryPath, { enableWAL: false });
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

        expect(await db.fetchGroup("missing")).toBeNull();
        expect(await db.fetchByLevel(99)).toBeNull();
        expect(await db.fetch("42")).toBeNull();
        expect(await db.fetchGroup("member")).toMatchObject({ name: "member", level: 1 });
        expect(await db.fetchByLevel(5)).toMatchObject({ name: "mod", level: 5 });
        expect((await db.listGroups()).map(group => group.name)).toEqual(["mod", "member"]);

        await db.add(member, user);
        expect((await db.fetch("42")).map(group => group.name)).toEqual(["member"]);
        expect(await db.listUsers()).toEqual([expect.objectContaining({ id: 1, user: "42", group: "member" })]);

        await db.transferUsers(member, mod);
        expect((await db.fetch("42")).map(group => group.name)).toEqual(["mod"]);

        const admin = new Group({ name: "admin", level: 10 });
        await db.updateGroup(mod, admin);
        expect(await db.fetchGroup("mod")).toBeNull();
        expect(await db.fetchGroup("admin")).toMatchObject({ name: "admin", level: 10 });

        await db.add(admin, new User({ user: "99" }));
        await db.removeByGroup(admin);
        expect(await db.fetch("42")).toBeNull();
        expect(await db.fetch("99")).toBeNull();

        await db.add(member, user);
        await db.remove(member, user);
        expect(await db.fetch("42")).toBeNull();

        await db.add(member, user);
        await db.removeAll(user);
        expect(await db.fetch("42")).toBeNull();

        await db.removeGroup(member);
        expect(await db.fetchGroup("member")).toBeNull();
    });
});
