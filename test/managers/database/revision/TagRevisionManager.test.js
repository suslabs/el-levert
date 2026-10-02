import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createRuntime } from "../../../helpers/runtimeHarness.js";

let runtime;
let TagManager;
let managers = [];

async function createManager() {
    const manager = new TagManager(true);
    managers.push(manager);

    await manager.load();
    return manager;
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    TagManager = (await import("../../../../src/managers/database/TagManager.js")).default;
    managers = [];
});

afterEach(async () => {
    for (const manager of managers) {
        await manager?.unload?.();
    }

    await cleanupRuntime(runtime);
});

describe("TagRevisionManager", () => {
    test("records tag lifecycle revisions and rename alias cascades", async () => {
        const manager = await createManager();

        const alpha = await manager.add("alpha", "one", "u1", { type: "text" }, true, { actor: "u1" });
        await manager.edit(alpha, "two", { type: "text" }, true, { actor: "u1" });

        const alias = await manager.alias(
            null,
            await manager.fetch("alpha"),
            "",
            {
                name: "alias",
                owner: "u1"
            },
            {
                validateNew: true,
                checkExisting: true
            },
            {
                actor: "u1"
            }
        );

        expect(alias[1]).toBe(true);

        await manager.rename(await manager.fetch("alpha"), "beta", true, { actor: "u1" });

        const betaRevisions = await manager.audit({ name: "beta", limit: 10 });
        expect(betaRevisions.map(revision => revision.operation)).toEqual(expect.arrayContaining(["create", "update"]));
        expect(betaRevisions.some(revision => revision.changed.includes("name"))).toBe(true);

        const aliasRevisions = await manager.audit({ name: "alias", limit: 10 });
        expect(aliasRevisions.some(revision => revision.changed.includes("aliasName"))).toBe(true);

        await manager.revert("beta", null, "u1", {
            actor: "u1",
            mod: false
        });

        expect(await manager.fetch("beta")).toBeNull();
        expect(await manager.fetch("alpha")).toMatchObject({ body: "two" });
        expect(await manager.fetch("alias")).toMatchObject({ aliasName: "alpha" });
        expect((await manager.audit({ name: "alias", limit: 1 })).at(0).changed).toContain("aliasName");

        await manager.delete(await manager.fetch("alpha"), true, { actor: "u1" });
        expect(await manager.fetch("alpha")).toBeNull();
        expect((await manager.audit({ name: "alpha", limit: 1 })).at(0).operation).toBe("delete");
    });

    test("reverts the latest eligible user edit once and lets mods restore arbitrary revisions", async () => {
        const manager = await createManager();

        const tag = await manager.add("alpha", "one", "u1", { type: "text" }, true, { actor: "u1" });
        await manager.edit(tag, "two", { type: "text" }, true, { actor: "u1" });

        const editRevision = (await manager.audit({ name: "alpha", limit: 1 })).at(0);
        expect(editRevision.operation).toBe("update");

        const restored = await manager.revert("alpha", null, "u1", {
            actor: "u1",
            mod: false
        });

        expect(restored.body).toBe("one");
        expect((await manager.fetch("alpha")).body).toBe("one");
        await expect(
            manager.revert("alpha", null, "u1", {
                actor: "u1",
                mod: false
            })
        ).rejects.toThrow("already been reverted");

        await manager.edit(await manager.fetch("alpha"), "three", { type: "text" }, true, { actor: "mod" });
        await manager.revert("alpha", editRevision.id, "mod", {
            actor: "mod",
            mod: true
        });

        expect((await manager.fetch("alpha")).body).toBe("two");

        await expect(
            manager.revert("alpha", editRevision.id, "mod", {
                actor: "mod",
                mod: true
            })
        ).rejects.toThrow("already in the requested state");
    });

    test("does not record revisions and disallows revert when enableAuditLog is false", async () => {
        const liveRuntime = await createRuntime({
                loadVMs: false,
                config: {
                    enableAuditLog: false
                }
            }),
            manager = liveRuntime.client.tagManager;

        try {
            await manager.add("disabled_rev", "one", "u1", { type: "text" });
            expect(await manager.revisions.findSubject("disabled_rev")).toBeNull();
            expect(await manager.audit({ name: "disabled_rev" })).toHaveLength(0);

            await expect(manager.revert("disabled_rev", 1, "u1")).rejects.toThrow("Tag revisions are disabled");
        } finally {
            await cleanupRuntime(liveRuntime);
        }
    });
});
