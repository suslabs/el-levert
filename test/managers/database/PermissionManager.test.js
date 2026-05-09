import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let PermissionManager;
let DisabledGroup;
let OwnerGroup;
let OwnerUser;
let managers;

async function createManager(enabled = true) {
    const manager = new PermissionManager(enabled);
    runtime.client.permManager = manager;
    managers.push(manager);

    if (enabled) {
        await manager.load();
    }

    return manager;
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    PermissionManager = (await import("../../../src/managers/database/PermissionManager.js")).default;
    ({ DisabledGroup, OwnerGroup, OwnerUser } = await import(
        "../../../src/structures/permission/PermissionDefaults.js"
    ));

    managers = [];

    runtime.client.owner = "owner-id";
    runtime.client.findUserById = async id => {
        if (id === "404") {
            throw new Error("not found");
        }

        return { id, username: `name-${id}` };
    };
});

afterEach(async () => {
    for (const manager of managers) {
        await manager?.unload?.();
    }

    await cleanupRuntime(runtime);
});

describe("PermissionManager", () => {
    test("uses the real sqlite database for group and user lifecycle flows", async () => {
        const manager = await createManager();

        expect(manager.owner.user).toBe("owner-id");
        expect(manager.isOwner("owner-id")).toBe(true);
        expect(manager.allowed(5, "mod")).toBe(true);
        expect(await manager.fetch("owner-id")).toEqual([OwnerGroup]);

        const mods = await manager.addGroup("mods", 5, true);
        const admins = await manager.addGroup("admins", 8, true);

        await manager.add(mods, "123", true);
        await manager.add(admins, "123", true);
        await manager.add(mods, "404", true);

        expect(await manager.maxLevel("123")).toBe(8);
        expect(await manager.isInGroup("mods", "123", true)).toBeTruthy();

        const users = await manager.listUsers(true);
        expect(users.find(user => user.user === "123").username).toBe("name-123");
        expect(users.find(user => user.user === "404").username).toBe("NOT FOUND");

        const groups = await manager.listGroups(true);
        expect(
            groups
                .find(group => group.name === "mods")
                .users.map(user => user.user)
                .sort()
        ).toEqual(["123", "404"]);
        expect(groups.find(group => group.name === "admins").users.map(user => user.user)).toEqual(["123"]);

        const renamed = await manager.updateGroup(mods, "helpers", 6, true);
        expect(renamed).toMatchObject({ name: "helpers", level: 6 });
        expect(await manager.fetchGroup("mods")).toBeNull();
        expect(await manager.fetchGroup("helpers")).toMatchObject({ level: 6 });

        expect(await manager.remove(renamed, "404", true)).toBe(true);
        expect(await manager.remove(admins, "404")).toBe(false);
        expect(await manager.removeAll("123")).toBe(true);

        await manager.removeGroup(renamed, true);
        expect(await manager.fetchGroup("helpers")).toBeNull();
    });

    test("covers disabled and error paths without mocking the database layer", async () => {
        const manager = await createManager();

        expect(manager.checkName("owner", false, false)[1]).toContain("owner");
        expect(manager.checkLevel(0, false)[1]).toContain("higher");
        expect(manager.checkLevel(manager.getLevels().owner, false, false)[1]).toContain("higher");

        await expect(manager.fetchGroup("missing", true)).rejects.toThrow("Group doesn't exist");
        await expect(manager.addGroup("owner", manager.getLevels().owner, true)).rejects.toThrow();

        const mods = await manager.addGroup("mods", 5, true);
        await expect(manager.addGroup("mods", 6, true)).rejects.toThrow("Group already exists");
        await expect(manager.add(OwnerGroup, "123")).rejects.toThrow();
        await expect(manager.remove(OwnerGroup, "123")).rejects.toThrow();
        await expect(manager.removeGroup(OwnerGroup)).rejects.toThrow();

        await expect(manager.remove(mods, "123", true)).rejects.toThrow("wasn't a part");
        await expect(manager.removeGroup({ name: "ghost" }, true)).rejects.toThrow("Group doesn't exist");
        await expect(manager.updateGroup(mods, "mods", null, true)).rejects.toThrow("same name");
        await expect(manager.updateGroup(mods, null, mods.level, true)).rejects.toThrow("same level");

        const disabled = await createManager(false);
        expect(disabled.getLevels().default).toBe(disabled.disabledLevel);
        expect(await disabled.fetch("whoever")).toEqual([DisabledGroup]);
        expect(await disabled.fetchGroup("anything")).toBe(DisabledGroup);
        expect(await disabled.isInGroup("mods", "123")).toBe(false);
        expect(disabled.allowed(0, "admin")).toBe(true);

        manager.owner = OwnerUser.user;
        expect(await manager.listGroups()).not.toBeNull();
    });
});
