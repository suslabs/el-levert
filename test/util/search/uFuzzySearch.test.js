import { describe, expect, test } from "vitest";

import createuFuzzySearch from "../../../src/util/search/uFuzzySearch.js";

describe("createuFuzzySearch", () => {
    test("returns ordered results with ranges and supports object haystacks", () => {
        const searcher = createuFuzzySearch();
        const haystack = ["alpha", "alphabet", "beta"];
        const out = searcher.search(haystack, "alp", {
            maxResults: 2
        });

        expect(out.results).toHaveLength(2);
        expect(out.ranges).toHaveLength(2);
        expect(out.other).toEqual({
            oversized: false,
            hasInfo: true,
            total: 2
        });

        const objOut = searcher.search([{ name: "alice" }, { name: "bob" }], "ali", { searchKey: "name" });

        expect(objOut.results[0]).toEqual({ name: "alice" });
    });

    test("returns empty results on misses and skips range info when over the threshold", () => {
        const searcher = createuFuzzySearch();

        expect(searcher.search(["alpha"], "zzz")).toEqual({
            results: [],
            ranges: [],
            other: {
                oversized: false,
                hasInfo: false,
                total: 0
            }
        });

        const out = searcher.search(["alpha", "alpine"], "al", {
            maxResults: 1,
            infoThresh: 0
        });

        expect(out.results).toEqual(["alpha"]);
        expect(out.ranges).toEqual([]);
        expect(out.other).toEqual({
            oversized: true,
            hasInfo: false,
            total: 2
        });
    });

    test("normalizes invalid haystacks and options, and supports negative limit for unlimited", () => {
        const searcher = createuFuzzySearch();

        expect(searcher.search(null, "alp", 5)).toEqual({
            results: [],
            ranges: [],
            other: {
                oversized: false,
                hasInfo: false,
                total: 0
            }
        });

        const allOut = searcher.search(["alpha", "alpine"], "al", {
            limit: -1
        });

        expect(allOut.results).toEqual(["alpha", "alpine"]);
        expect(allOut.other.oversized).toBe(false);
        expect(allOut.other.total).toBe(2);
    });

    test("supports smaller functions: filter, sort, and slice", () => {
        const searcher = createuFuzzySearch();
        const haystack = ["alpha", "alphabet", "alpine", "beta"];

        const filtered = searcher.filter(haystack, "al");
        expect(filtered.inds).toHaveLength(3);

        const sorted = searcher.sort(haystack, "al");
        expect(sorted.total).toBe(3);
        expect(sorted.order).toHaveLength(3);

        const sliced = searcher.slice(sorted, 1, 2);
        expect(sliced.results).toHaveLength(2);
        expect(sliced.ranges).toHaveLength(2);
        expect(sliced.other.oversized).toBe(false);

        const standaloneSliced = createuFuzzySearch.slice(sorted, 1, 2);
        expect(standaloneSliced.results).toEqual(sliced.results);
    });

    test("supports factory customization without any global default", () => {
        const defaultSearcher = createuFuzzySearch();
        expect(defaultSearcher.options.alpha).toBe("a-z");

        const tagSearcher = createuFuzzySearch({
            alpha: "a-z",
            interLft: 2,
            intraMode: 1,
            intraSub: 1,
            intraTrn: 1
        });

        const tagHaystack = ["ck_base2n", "backpack", "ck_font_customemoji", "tagname", "tag_name"];

        const ckMatch = tagSearcher.search(tagHaystack, "ck");
        expect(ckMatch.results).toContain("ck_base2n");
        expect(ckMatch.results).not.toContain("backpack");

        const typoMatch = tagSearcher.search(tagHaystack, "customemji");
        expect(typoMatch.results).toContain("ck_font_customemoji");

        const boundaryMatch = tagSearcher.search(tagHaystack, "name");
        expect(boundaryMatch.results).toContain("tag_name");
        expect(boundaryMatch.results).not.toContain("tagname");
    });
});
