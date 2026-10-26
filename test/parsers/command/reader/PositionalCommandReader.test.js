import { describe, expect, test } from "vitest";

import PositionalCommandReader from "../../../../src/parsers/command/reader/PositionalCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";

describe("PositionalCommandReader", () => {
    test("splits arguments with single and multiple separators", () => {
        expect(PositionalCommandReader.split("ONE TWO", { lowercase: true })).toEqual(["one", "TWO"]);
        expect(PositionalCommandReader.split("a,b,c", { separator: ",", n: 2 })).toEqual(["a,b", "c"]);
        expect(PositionalCommandReader.split("a\nb c", { lowercase: true, separator: [" ", "\n"] })).toEqual([
            "a",
            "b c"
        ]);
        expect(PositionalCommandReader.split("abc", { separator: [] })).toEqual(["abc", ""]);
        expect(PositionalCommandReader.split(null, { separator: [null, ","] })).toEqual(["", ""]);
        expect(PositionalCommandReader.split("abc", { separator: [null], n: 0 })).toEqual(["abc", ""]);
        expect(PositionalCommandReader.split("abc", { separator: ",", n: 2 })).toEqual(["abc", ""]);
    });

    test("read() extracts positional arguments including text with apostrophes", () => {
        const reader0 = new PositionalCommandReader({ index: 0 }),
            reader1 = new PositionalCommandReader({ index: 1 });

        const session = new CommandParseSession({
            argsText: "test1234 a'b"
        });

        expect(reader0.read(session)).toBe("test1234");
        expect(reader1.read(session)).toBe("a'b");
    });

    test("read() returns undefined when index is out of bounds", () => {
        const reader = new PositionalCommandReader({ index: 5 });

        const session = new CommandParseSession({
            argsText: "one two"
        });

        expect(reader.read(session)).toBeUndefined();
    });
});
