import { describe, expect, test } from "vitest";

import { ScriptCommandType } from "../../../../../src/parsers/command/type/index.js";

describe("ScriptCommandType", () => {
    test("parses fenced, inline, and raw scripts", () => {
        expect(ScriptCommandType.parse("plain")).toEqual({
            body: "plain",
            language: "",
            isScript: false
        });

        expect(ScriptCommandType.parse("```js\nconsole.log(1)\n```")).toEqual({
            body: "console.log(1)",
            language: "js",
            isScript: true
        });

        expect(ScriptCommandType.parse("`1 + 1`")).toEqual({
            body: "1 + 1",
            language: "",
            isScript: true
        });

        expect(ScriptCommandType.parse(null)).toEqual({
            body: "",
            language: "",
            isScript: false
        });
    });
});
