import { describe, expect, test } from "vitest";

import diceDist from "../../../src/util/search/diceDist.js";
import diceSearch from "../../../src/util/search/diceSearch.js";

describe("diceDist", () => {
    test("handles invalid inputs without throwing and searches normalized haystacks", () => {
        expect(diceDist("alpha", "alpha")).toBe(1);
        expect(diceDist(5, 5)).toBe(0);
        expect(diceDist("a", "b")).toBe(0);

        expect(diceSearch(null, "alp", 5)).toEqual({
            results: [],
            other: {
                oversized: false
            }
        });
    });
});
