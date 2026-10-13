import { describe, expect, test } from "vitest";

import uFuzzySearch from "../../../src/util/search/uFuzzySearch.js";

describe("uFuzzySearch", () => {
    test("returns ordered results with ranges and supports object haystacks", () => {
        const haystack = ["alpha", "alphabet", "beta"];
        const out = uFuzzySearch.search(haystack, "alp", {
            maxResults: 2
        });

        expect(out.results).toHaveLength(2);
        expect(out.ranges).toHaveLength(2);
        expect(out.other).toEqual({
            oversized: false,
            hasInfo: true
        });

        const objOut = uFuzzySearch.search([{ name: "alice" }, { name: "bob" }], "ali", { searchKey: "name" });

        expect(objOut.results[0]).toEqual({ name: "alice" });
    });

    test("returns empty results on misses and skips range info when over the threshold", () => {
        expect(uFuzzySearch.search(["alpha"], "zzz")).toEqual({
            results: [],
            ranges: [],
            other: {
                oversized: false,
                hasInfo: undefined
            }
        });

        const out = uFuzzySearch.search(["alpha", "alpine"], "al", {
            maxResults: 1,
            infoThresh: 0
        });

        expect(out.results).toEqual(["alpha"]);
        expect(out.ranges).toEqual([]);
        expect(out.other).toEqual({
            oversized: true,
            hasInfo: false
        });
    });

    test("normalizes invalid haystacks and options", () => {
        expect(uFuzzySearch.search(null, "alp", 5)).toEqual({
            results: [],
            ranges: [],
            other: {
                oversized: false,
                hasInfo: undefined
            }
        });
    });

    test("supports smaller functions: filter, sort, and slice", () => {
        const haystack = ["alpha", "alphabet", "alpine", "beta"];

        const filtered = uFuzzySearch.filter(haystack, "al");
        expect(filtered.inds).toHaveLength(3);

        const sorted = uFuzzySearch.sort(haystack, "al");
        expect(sorted.total).toBe(3);
        expect(sorted.order).toHaveLength(3);

        const sliced = uFuzzySearch.slice(sorted, 1, 2);
        expect(sliced.results).toHaveLength(2);
        expect(sliced.ranges).toHaveLength(2);
        expect(sliced.other.oversized).toBe(false);
    });
});
