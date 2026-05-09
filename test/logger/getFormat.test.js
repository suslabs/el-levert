import { describe, expect, test } from "vitest";

import getFormat from "../../src/logger/getFormat.js";

describe("getFormat", () => {
    test("builds default and combined winston formats", () => {
        expect(getFormat()).toHaveProperty("transform");
        expect(getFormat("json")).toHaveProperty("transform");
        expect(getFormat(["json", "simple"])).toHaveProperty("transform");
        expect(() => getFormat("definitely-invalid")).toThrow("Invalid format");
    });
});
