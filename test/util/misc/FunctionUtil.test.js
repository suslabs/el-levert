import { describe, expect, test } from "vitest";

import FunctionUtil from "../../../src/util/misc/FunctionUtil.js";

describe("FunctionUtil", () => {
    test("binds arguments while preserving the calling context", () => {
        const bound = FunctionUtil.bindArgs(function (first, second) {
            return [this.value, first, second];
        }, "alpha");

        expect(bound.call({ value: 7 }, "beta")).toEqual([7, "alpha", "beta"]);
    });

    test("extracts function arguments and their positions", () => {
        function sample(first, second, third) {}

        expect(FunctionUtil.functionArgumentNames(sample)).toEqual(["first", "second", "third"]);
        expect(FunctionUtil.getArgumentPositions(sample, ["third", "missing", "first"])).toEqual([2, 0]);
    });
});
