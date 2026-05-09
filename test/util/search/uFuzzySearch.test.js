import { describe, expect, test } from "vitest";

import uFuzzySearch from "../../../src/util/search/uFuzzySearch.js";

describe("uFuzzySearch", () => {
    test("returns ordered results with ranges and supports object haystacks", () => {
        const haystack = ["alpha", "alphabet", "beta"];
        const out = uFuzzySearch(haystack, "alp", {
            maxResults: 2
        });

        expect(out.results).toHaveLength(2);
        expect(out.ranges).toHaveLength(2);
        expect(out.other).toEqual({
            oversized: false,
            hasInfo: true
        });

        const objOut = uFuzzySearch([{ name: "alice" }, { name: "bob" }], "ali", { searchKey: "name" });

        expect(objOut.results[0]).toEqual({ name: "alice" });
    });

    test("returns empty results on misses and skips range info when over the threshold", () => {
        expect(uFuzzySearch(["alpha"], "zzz")).toEqual({
            results: [],
            ranges: [],
            other: {
                oversized: false,
                hasInfo: undefined
            }
        });

        const out = uFuzzySearch(["alpha", "alpine"], "al", {
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
});
