import { describe, expect, test } from "vitest";

import getRegisterCode from "../../../src/util/vm/getRegisterCode.js";

class ExitError extends Error {}

describe("getRegisterCode", () => {
    test("generates reference-based registration wrappers", () => {
        const code = getRegisterCode({
            objName: "api",
            funcName: "run",
            type: "applySync"
        });

        expect(code).toContain("api.run");
        expect(code).toContain("$0.applySync");
    });

    test("generates string-function wrappers and embedded error classes", () => {
        const code = getRegisterCode(
            {
                objName: "",
                funcName: "run",
                type: "applySync"
            },
            {
                stringFunc: true,
                func: function run(...args) {
                    return args.join(",");
                }
            },
            {
                class: ExitError,
                accessible: false
            }
        );

        expect(code).toContain("class ExitError");
        expect(code).toContain("function run(...args)");
        expect(code).toContain("run = (...args) =>");
        expect(code).toContain("throw new ExitError");
    });
});
