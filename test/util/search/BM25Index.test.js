import { describe, expect, test } from "vitest";

import BM25Index from "../../../src/util/search/BM25Index.js";

function createIndex() {
    const index = new BM25Index({ title: 3, text: 1 });

    index.add({ id: "steel", title: "Steel Age", text: "Make steel in the electric blast furnace." });
    index.add({ id: "iron", title: "Iron Age", text: "Smelt iron ore in a furnace." });
    index.add({ id: "wood", title: "Wood", text: "Punch a tree." });

    return index;
}

describe("BM25Index", () => {
    test("tokenizes lowercase words without stop words", () => {
        expect(BM25Index.tokenize("How do I make STEEL-ingots?")).toEqual(["make", "steel", "ingots"]);
        expect(BM25Index.tokenize(null)).toEqual([]);
    });

    test("requires at least one weighted field", () => {
        expect(() => new BM25Index({ title: 0 })).toThrow("At least one weighted field is required");
    });

    test("ranks title matches above body matches", () => {
        const results = createIndex().search("steel furnace");

        expect(results.map(res => res.doc.id)).toEqual(["steel", "iron"]);
        expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    test("respects the limit and ignores unmatched queries", () => {
        const index = createIndex();

        expect(index.size).toBe(3);
        expect(index.search("furnace", 1)).toHaveLength(1);
        expect(index.search("diamond")).toEqual([]);
        expect(index.search("the")).toEqual([]);
        expect(new BM25Index({ text: 1 }).search("steel")).toEqual([]);
    });
});
