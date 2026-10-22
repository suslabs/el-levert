import { describe, expect, test } from "vitest";

import VMHttpErrorTypes from "../../../src/util/vm/VMHttpErrorTypes.js";

describe("VMHttpErrorTypes", () => {
    test("exposes the supported error handling modes", () => {
        expect(VMHttpErrorTypes).toEqual({
            legacy: "legacy",
            value: "value"
        });
        expect(Object.isFrozen(VMHttpErrorTypes)).toBe(true);
    });
});
