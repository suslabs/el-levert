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
                alpha = await liveRuntime.client.tagManager.add("alpha", "body", "u1", "text");

            await liveRuntime.client.tagManager.alias(null, alpha, "", {
                name: "beta",
                owner: "u1"
            });
            await liveRuntime.client.tagManager.add("gamma", "console.log(1)", "u2", "ivm");
            await liveRuntime.client.tagManager.add("delta", "body", "u3", "text");
            await liveRuntime.client.tagManager.execute(await liveRuntime.client.tagManager.fetch("alpha"), "");
            await liveRuntime.client.tagManager.execute(await liveRuntime.client.tagManager.fetch("delta"), "");
            await liveRuntime.client.tagManager.delete(await liveRuntime.client.tagManager.fetch("delta"));

            await liveRuntime.client.tagManager.tag_db.db.run("DELETE FROM Quotas WHERE 1=1;");
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

            expect(await liveRuntime.client.tagManager.tag_db.quotaFetch("ghost")).toBeNull();
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
});
