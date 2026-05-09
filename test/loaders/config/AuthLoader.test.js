import { describe, expect, test } from "vitest";

import "../../../setupGlobals.js";

import AuthLoader from "../../../src/loaders/config/AuthLoader.js";

describe("AuthLoader", () => {
    test("defaults an empty owner id and preserves configured owners", () => {
        const loader = new AuthLoader(null);

        const config = {
            owner: ""
        };

        loader.data = config;
        loader._modify();
        expect(config.owner).toBe("0");

        const existing = {
            owner: "42"
        };

        loader.data = existing;
        loader._modify();
        expect(existing.owner).toBe("42");
    });
});
