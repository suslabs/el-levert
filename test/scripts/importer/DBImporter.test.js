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
});
