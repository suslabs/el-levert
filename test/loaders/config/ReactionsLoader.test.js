import { describe, expect, test } from "vitest";

import ReactionsLoader from "../../../src/loaders/config/ReactionsLoader.js";

describe("ReactionsLoader", () => {
    test("normalizes invalid funnyWords to an array", () => {
        const loader = Object.create(ReactionsLoader.prototype);
        const config = { parens: null, funnyWords: null };

        loader.modify(config);

        expect(config.parens).toEqual({});
        expect(config.funnyWords).toEqual([]);
    });
});
