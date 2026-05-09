import { describe, expect, test } from "vitest";

import RegexUtil from "../../../src/util/misc/RegexUtil.js";

describe("RegexUtil", () => {
    test("processes regex helpers", () => {
        expect(RegexUtil.escapeRegex("a+b?")).toBe("a\\+b\\?");
        expect(RegexUtil.escapeCharClass("a-]")).toBe("a\\-\\]");
        expect(RegexUtil.validFlags("gi")).toBe(true);
        expect(RegexUtil.validFlags("gg")).toBe(false);

        const match = /(?<nameA>alpha)|(?<nameB>beta)/.exec("beta");
        expect(RegexUtil.firstGroup(match, "name")).toBe("beta");
        expect(RegexUtil.firstGroup(null, "name")).toBeNull();
        expect(RegexUtil.wordStart("hello-world", 6)).toBe(true);
        expect(RegexUtil.wordEnd("hello", 4)).toBe(true);
        expect(RegexUtil.getMergedRegex([])).toBeNull();
        expect("cleveret rabbit".match(RegexUtil.getWordRegex(["leveret", "rabbit"]))).toEqual(["rabbit"]);
        expect(RegexUtil.getMergedRegex([/cat/g, /dog/i]).source).toContain("cat");
        expect(RegexUtil.multipleReplace("abc123", [/[a-z]+/, "letters"], [/\d+/, value => `[${value}]`])).toBe(
            "lettersbc[123]23"
        );
        expect(RegexUtil.templateReplace("Hi {{ name }} and \\{{ skip }}", { name: "Alex" })).toBe(
            "Hi Alex and \\{{ skip }}"
        );
    });
});
