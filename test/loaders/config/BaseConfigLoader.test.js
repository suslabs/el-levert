import { describe, expect, test } from "vitest";

import BaseConfigLoader from "../../../src/loaders/config/BaseConfigLoader.js";

describe("BaseConfigLoader", () => {
    test("uses objects returned by modify hooks as loaded data", () => {
        const loader = Object.create(BaseConfigLoader.prototype);
        loader.data = { original: true };
        loader._childModify = () => ({ modified: true });

        loader._modify();

        expect(loader.data).toEqual({ modified: true });
    });
});
