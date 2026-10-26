import { describe, expect, test } from "vitest";

import MatchCommandReader from "../../../../src/parsers/command/reader/MatchCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";

describe("MatchCommandReader", () => {
    test("reads regex match capture group at given index", () => {
        const pattern = /^(\d+)-([a-z]+)$/,
            reader0 = new MatchCommandReader({ pattern, index: 1 }),
            reader1 = new MatchCommandReader({ pattern, index: 2 });

        const session = new CommandParseSession({
            argsText: "123-abc"
        });

        expect(reader0.read(session)).toBe("123");
        expect(reader1.read(session)).toBe("abc");
    });

    test("returns undefined when pattern does not match", () => {
        const reader = new MatchCommandReader({
            pattern: /^\d+$/,
            index: 0
        });

        const session = new CommandParseSession({
            argsText: "not-a-number"
        });

        expect(reader.read(session)).toBeUndefined();
    });

    test("returns undefined when pattern is null", () => {
        const reader = new MatchCommandReader({
            pattern: null
        });

        const session = new CommandParseSession({
            argsText: "hello"
        });

        expect(reader.read(session)).toBeUndefined();
    });
});
