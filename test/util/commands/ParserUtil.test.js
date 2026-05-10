import { describe, expect, test } from "vitest";

import ParserUtil from "../../../src/util/commands/ParserUtil.js";

describe("ParserUtil", () => {
    test("splits arguments with single and multiple separators", () => {
        expect(ParserUtil.splitArgs("ONE TWO", true)).toEqual(["one", "TWO"]);
        expect(ParserUtil.splitArgs("ONE TWO", [true, true])).toEqual(["one", "two"]);
        expect(ParserUtil.splitArgs("a,b,c", false, { sep: ",", n: 2 })).toEqual(["a,b", "c"]);
        expect(ParserUtil.splitArgs("a\nb c", { lowercase: [false, true], sep: [" ", "\n"] })).toEqual(["a", "b c"]);
        expect(ParserUtil.splitArgs("abc", false, { sep: [] })).toEqual(["abc", ""]);
        expect(ParserUtil.splitArgs(null, false, { sep: [null, ","] })).toEqual(["", ""]);
        expect(ParserUtil.splitArgs("abc", false, { sep: [null], n: 0 })).toEqual(["abc", ""]);
        expect(ParserUtil.splitArgs("abc", false, { sep: ",", n: 2 })).toEqual(["abc", ""]);
    });

    test("parses fenced, inline, and raw scripts", () => {
        expect(ParserUtil.parseScript("plain")).toEqual({
            body: "plain",
            isScript: false,
            lang: ""
        });

        expect(ParserUtil.parseScript("```js\nconsole.log(1)\n```")).toEqual({
            body: "console.log(1)",
            isScript: true,
            lang: "js"
        });

        expect(ParserUtil.parseScript("`1 + 1`")).toEqual({
            body: "1 + 1",
            isScript: true,
            lang: ""
        });

        expect(ParserUtil.parseScript(null)).toEqual({
            body: "",
            isScript: false,
            lang: ""
        });
    });
});
