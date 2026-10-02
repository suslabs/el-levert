import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";
import ArrayUtil from "../../../src/util/ArrayUtil.js";

let runtime;
let DBImporter;
let TagDifferenceType;

function createImporter() {
    return Object.create(DBImporter.prototype, {
        tagManager: {
            value: {
                checkName: vi.fn(name => [name, null])
            }
        }
    });
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: DBImporter } = await import("../../../scripts/importer/DBImporter.js"));
    ({ default: TagDifferenceType } = await import("../../../scripts/importer/TagDifferenceType.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("DBImporter", () => {
    test("computes existing, new, and deleted tag differences", () => {
        const currentTags = [
                { name: "old-only", isOld: true },
                { name: "both-old", isOld: true },
                { name: "current-only", isOld: false }
            ],
            importTags = [{ name: "both-old" }, { name: "new-only" }];

        const diff = DBImporter.getDifference(currentTags, importTags, TagDifferenceType.all);

        expect(ArrayUtil.sameElements(diff.existingTags, ["both-old"], false)).toBe(true);
        expect(ArrayUtil.sameElements(diff.newTags, ["new-only"], false)).toBe(true);
        expect(ArrayUtil.sameElements(diff.deletedTags, ["old-only"], false)).toBe(true);
        expect(diff.oldTags).toHaveLength(2);
    });

    test("honors requested diff type subsets", () => {
        const currentTags = [
                { name: "a", isOld: true },
                { name: "b", isOld: true }
            ],
            importTags = [{ name: "b" }, { name: "c" }];

        const diff = DBImporter.getDifference(currentTags, importTags, [TagDifferenceType.new]);

        expect(diff).toEqual({
            newTags: ["c"]
        });
    });

    test("treats duplicates as multiset differences", () => {
        const currentTags = [
                { name: "x", isOld: true },
                { name: "x", isOld: true },
                { name: "y", isOld: true }
            ],
            importTags = [{ name: "x" }, { name: "x" }, { name: "x" }, { name: "z" }];

        const diff = DBImporter.getDifference(currentTags, importTags, TagDifferenceType.all);

        expect(ArrayUtil.sameElements(diff.existingTags, ["x", "x"], false)).toBe(true);
        expect(ArrayUtil.sameElements(diff.deletedTags, ["y"], false)).toBe(true);
        expect(ArrayUtil.sameElements(diff.newTags, ["x", "z"], false)).toBe(true);
    });

    test("normalizes old hops arrays to scalar aliasName", () => {
        const importer = createImporter();
        const data = { name: "ignored", hops: ["alias_tag", "target", "final"], body: "" };

        expect(importer._validTag(data)).toBe(true);
        expect(data.name).toBe("alias_tag");
        expect(data.aliasName).toBe("target");
    });

    test("accepts new scalar aliasName data", () => {
        const importer = createImporter();
        const data = { name: "alias_tag", aliasName: "target", body: "" };

        expect(importer._validTag(data)).toBe(true);
        expect(data.name).toBe("alias_tag");
        expect(data.aliasName).toBe("target");
    });

    test("validates import paths and update modes before loading", async () => {
        const importer = Object.create(DBImporter.prototype, {
            logger: {
                value: {
                    warn: vi.fn(),
                    info: vi.fn(),
                    error: vi.fn()
                }
            },
            tagManager: {
                value: {
                    dump: vi.fn()
                }
            }
        });

        await expect(importer.updateDatabase("   ")).rejects.toThrow("No import path provided");
        await expect(importer.updateDatabase("tags.json", 1)).rejects.toThrow("No update mode provided");
        await expect(importer.updateDatabase("tags.json", "bad")).rejects.toThrow("Invalid update mode");
    });

    test("parses a script tag properly via _parseTag", () => {
        const data = {
            name: "test_script",
            body: "```js\nconsole.log(1)\n```"
        };

        const tag = DBImporter._parseTag(data);
        expect(tag.name).toBe("test_script");
        expect(tag.body).toBe("console.log(1)");
        expect(tag.isScript).toBe(true);
        expect(tag.getScriptLanguage()).toBe("js");
    });

    test("fix delegates database refresh to the public vacuum api", async () => {
        const importer = Object.create(DBImporter.prototype, {
            _fixQuotas: {
                value: vi.fn().mockResolvedValue(undefined)
            },
            _fixUsage: {
                value: vi.fn().mockResolvedValue(undefined)
            },
            tagManager: {
                value: {
                    tag_db: {
                        vacuum: vi.fn().mockResolvedValue(undefined)
                    }
                }
            }
        });

        await importer.fix();

        expect(importer._fixQuotas).toHaveBeenCalledTimes(1);
        expect(importer._fixUsage).toHaveBeenCalledTimes(1);
        expect(importer.tagManager.tag_db.vacuum).toHaveBeenCalledTimes(1);
    });

    test("fix recalculates quota counts, prunes zero usage, and preserves historical usage", async () => {
        const liveRuntime = await createRuntime({
                loadVMs: false
            }),
            logger = {
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn()
            };

        try {
            const importer = new DBImporter(liveRuntime.client.tagManager, logger),
                alpha = await liveRuntime.client.tagManager.add("alpha", "body", "u1", { type: "text" });

            await liveRuntime.client.tagManager.alias(null, alpha, "", {
                name: "beta",
                owner: "u1"
            });
            await liveRuntime.client.tagManager.add("gamma", "console.log(1)", "u2", { type: "ivm" });
            await liveRuntime.client.tagManager.add("delta", "body", "u3", { type: "text" });
            await liveRuntime.client.tagManager.execute(await liveRuntime.client.tagManager.fetch("alpha"), "");
            await liveRuntime.client.tagManager.execute(await liveRuntime.client.tagManager.fetch("delta"), "");
            await liveRuntime.client.tagManager.delete(await liveRuntime.client.tagManager.fetch("delta"));

            await liveRuntime.client.tagManager.tag_db.db.run("PRAGMA foreign_keys = OFF;");
            await liveRuntime.client.tagManager.tag_db.db.run("UPDATE Quotas SET quota = 999.0, count = 999;");
            await liveRuntime.client.tagManager.tag_db.db.run(
                "INSERT INTO Quotas (user, quota, count) VALUES ($user, $quota, $count);",
                {
                    $user: "ghost",
                    $quota: 9,
                    $count: 9
                }
            );
            await liveRuntime.client.tagManager.tag_db.db.run(
                "INSERT INTO Usage (name, count) VALUES ($name, $count);",
                {
                    $name: "orphan",
                    $count: 5
                }
            );

            await importer.fix();

            expect(await liveRuntime.client.tagManager.tag_db.quotaFetchAll("ghost")).toBeNull();
            expect(await liveRuntime.client.tagManager.tag_db.quotaCountFetch("u1")).toBe(2);
            expect(await liveRuntime.client.tagManager.tag_db.quotaCountFetch("u2")).toBe(1);
            expect(await liveRuntime.client.tagManager.tag_db.quotaCountFetch("u3")).toBeNull();
            expect(await liveRuntime.client.tagManager.tag_db.usageFetch("alpha")).toBe(1);
            expect(await liveRuntime.client.tagManager.tag_db.usageFetch("beta")).toBeNull();
            expect(await liveRuntime.client.tagManager.tag_db.usageFetch("delta")).toBe(1);
            expect(await liveRuntime.client.tagManager.tag_db.usageFetch("orphan")).toBe(5);
        } finally {
            await cleanupRuntime(liveRuntime);
        }
    });

    test("importer mocks disable audit logging by default and record revisions when enabled", async () => {
        const liveRuntime = await createRuntime({
                loadVMs: false,
                config: {
                    enableAuditLog: false
                }
            }),
            logger = {
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn()
            };

        try {
            const importer = new DBImporter(liveRuntime.client.tagManager, logger);

            await liveRuntime.client.tagManager.add("imported_one", "body", "u1", { type: "text" });

            expect(await liveRuntime.client.tagManager.revisions.findSubject("imported_one")).toBeNull();
            expect(await liveRuntime.client.tagManager.audit({ name: "imported_one" })).toHaveLength(0);

            liveRuntime.client.config.enableAuditLog = true;

            await liveRuntime.client.tagManager.add("imported_two", "body", "u1", { type: "text" });

            const revisions = await liveRuntime.client.tagManager.audit({ name: "imported_two" });
            expect(revisions).toHaveLength(1);
            expect(revisions[0].actor).toBe("u1");
        } finally {
            await cleanupRuntime(liveRuntime);
        }
    });

    test("FakeClient defaults enableAuditLog to false and accepts options override", async () => {
        const { LevertClient, _resetClient } = await import("../../../scripts/importer/mock/FakeClient.js");

        _resetClient();
        const client1 = new LevertClient({ test: 1 }, {});
        expect(client1.config.enableAuditLog).toBe(false);

        _resetClient();
        const client2 = new LevertClient({ test: 1 }, {}, { enableAuditLog: true });
        expect(client2.config.enableAuditLog).toBe(true);

        _resetClient();
    });
});
