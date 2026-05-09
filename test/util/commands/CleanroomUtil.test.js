import { describe, expect, test } from "vitest";
import CleanroomUtil from "../../../src/util/commands/CleanroomUtil.js";

describe("CleanroomUtil branch coverage", () => {
    test("accepts array input and rejects dimensions outside the supported bounds", () => {
        expect(CleanroomUtil.calc([5, 5, 5])).toEqual({
            controller: 1,
            frame: 44,
            walls: 46,
            filters: 8
        });

        expect(() => CleanroomUtil.calc(2, 3, 3)).toThrow("at least 3x3x3");
        expect(() => CleanroomUtil.calc(16, 5, 5)).toThrow("cannot be bigger than 15x15x15");
    });
});
