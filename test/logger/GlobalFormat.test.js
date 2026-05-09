import { describe, expect, test } from "vitest";

import getGlobalFormat from "../../src/logger/GlobalFormat.js";

describe("GlobalFormat", () => {
    test("enumerates error messages and stacks", () => {
        const format = getGlobalFormat();
        const err = new Error("boom");
        const transformed = format.transform({
            level: "error",
            message: err
        });

        expect(transformed.message).toEqual(expect.objectContaining({ message: "boom" }));
    });
});
