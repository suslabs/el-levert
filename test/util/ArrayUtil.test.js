import { describe, expect, test } from "vitest";

import ArrayUtil from "../../src/util/ArrayUtil.js";
import { LengthTypes } from "../../src/util/LengthTypes.js";

describe("ArrayUtil", () => {
    test("supports array creation, aggregation, sorting, and grouping", () => {
        expect(ArrayUtil.withLength(3, i => i * 2)).toEqual([0, 2, 4]);
        expect(ArrayUtil.guaranteeArray("x")).toEqual(["x"]);
        expect(ArrayUtil.guaranteeArray(["x"], 3)).toEqual(["x", undefined, undefined]);
        expect(ArrayUtil.guaranteeArray(null, null, true)).toEqual([]);
        expect(ArrayUtil.guaranteeFirst([1, 2])).toBe(1);
        expect(ArrayUtil.sum([{ n: 1 }, { n: 2 }], "n")).toBe(3);
        expect(ArrayUtil.concat(["a"], "b", "c")).toEqual(["a", "b", "c"]);
        expect(ArrayUtil.frequency(["a", "b", "a"]).get("a")).toBe(2);
        expect(ArrayUtil.unique([{ id: 1 }, { id: 1 }, { id: 2 }], "id")).toEqual([{ id: 1 }, { id: 2 }]);
        expect(ArrayUtil.hasDuplicates([{ id: 1 }, { id: 2 }, { id: 1 }], "id")).toBe(true);
        expect(ArrayUtil.sameElements([1, 2], [2, 1], false)).toBe(true);
        expect(ArrayUtil.sort(["10", "2", "1"])).toEqual(["1", "2", "10"]);
        expect(ArrayUtil.groupBy([1, 2, 3], value => (value % 2 === 0 ? "even" : "odd"))).toEqual({
            odd: [1, 3],
            even: [2]
        });
        expect(
            ArrayUtil.groupBy(
                [
                    { category: "fruit", name: "apple" },
                    { category: "vegetable", name: "carrot" },
                    { category: "fruit", name: "banana" }
                ],
                "category"
            )
        ).toEqual({
            fruit: [
                { category: "fruit", name: "apple" },
                { category: "fruit", name: "banana" }
            ],
            vegetable: [{ category: "vegetable", name: "carrot" }]
        });
        expect(ArrayUtil.groupBy(["a", "b", "c"], (_, i) => i % 2)).toEqual({
            0: ["a", "c"],
            1: ["b"]
        });
        expect(Object.getPrototypeOf(ArrayUtil.groupBy([1], () => "toString"))).toBeNull();
        expect(ArrayUtil.groupBy(["item"], () => "toString").toString).toEqual(["item"]);
        expect(Object.getPrototypeOf(ArrayUtil.groupBy([]))).toBeNull();
        expect(ArrayUtil.groupBy(["x", "y", "x"])).toEqual({
            x: ["x", "x"],
            y: ["y"]
        });

        {
            const mapGroups = ArrayUtil.groupByMap([1, 2, 3], value => value % 2 === 0);
            expect(mapGroups instanceof Map).toBe(true);
            expect(mapGroups.get(false)).toEqual([1, 3]);
            expect(mapGroups.get(true)).toEqual([2]);

            const mapByProp = ArrayUtil.groupByMap([{ k: "a" }, { k: "b" }, { k: "a" }], "k");
            expect(mapByProp.get("a")).toEqual([{ k: "a" }, { k: "a" }]);
            expect(mapByProp.get("b")).toEqual([{ k: "b" }]);

            const objKey = { id: 1 },
                mapByObj = ArrayUtil.groupByMap(["val"], () => objKey);
            expect(mapByObj.get(objKey)).toEqual(["val"]);
        }
        expect(ArrayUtil.split([1, 2, 3], value => value % 2)).toEqual([[2], [1, 3]]);
        expect(ArrayUtil.zip([1, 2], ["a", "b", "c"])).toEqual([
            [1, "a"],
            [2, "b"]
        ]);
        {
            const out = ArrayUtil.diff(["a", "a", "b"], ["a"]);
            expect(ArrayUtil.sameElements(out.shared, ["a"], false)).toBe(true);
            expect(ArrayUtil.sameElements(out.removed, ["a", "b"], false)).toBe(true);
            expect(ArrayUtil.sameElements(out.added, [], false)).toBe(true);
        }

        {
            const out = ArrayUtil.diff(["a", "b", "a"], ["b", "c", "a", "a"]);
            expect(ArrayUtil.sameElements(out.shared, ["a", "a", "b"], false)).toBe(true);
            expect(ArrayUtil.sameElements(out.removed, [], false)).toBe(true);
            expect(ArrayUtil.sameElements(out.added, ["c"], false)).toBe(true);
        }

        {
            const out = ArrayUtil.diff([{ id: 1 }, { id: 1 }, { id: 2 }], [{ id: 1 }, { id: 3 }], "id");
            expect(ArrayUtil.sameElements(out.shared, [{ id: 1 }], false, "id")).toBe(true);
            expect(ArrayUtil.sameElements(out.removed, [{ id: 1 }, { id: 2 }], false, "id")).toBe(true);
            expect(ArrayUtil.sameElements(out.added, [{ id: 3 }], false, "id")).toBe(true);
        }
        expect(ArrayUtil.maxLength(["a", "abcd", "ab"], LengthTypes.string)).toBe(4);
    });

    test("removes items and supports async loops", async () => {
        const values = [1, 2, 3];
        expect(ArrayUtil.removeItem(values, 2)).toEqual([true, 3]);
        expect(values).toEqual([1, 2]);

        const asyncValues = [1, 2, 3];
        await expect(
            ArrayUtil.removeItem(
                asyncValues,
                item => item === 2,
                async idx => idx === 1
            )
        ).resolves.toEqual([true, 2]);
        expect(asyncValues).toEqual([1, 3]);

        const visited = [];
        ArrayUtil.maybeAsyncForEach([1, 2], value => visited.push(value));
        expect(visited).toEqual([1, 2]);

        const asyncVisited = [];
        await ArrayUtil.maybeAsyncForEach([1, 2], async value => {
            asyncVisited.push(value);
        });
        expect(asyncVisited).toEqual([1, 2]);

        const wipeSync = [1, 2, 3];
        expect(ArrayUtil.wipeArray(wipeSync, value => value !== 2)).toBe(2);
        expect(wipeSync).toEqual([2]);

        const wipeAsync = [1, 2, 3];
        await expect(ArrayUtil.wipeArray(wipeAsync, async value => value === 1)).resolves.toBe(1);
        expect(wipeAsync).toEqual([2, 3]);
    });
});
