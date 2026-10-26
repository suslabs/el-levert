import { describe, expect, test } from "vitest";

import ListCommandReader from "../../../../src/parsers/command/reader/ListCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";

describe("ListCommandReader", () => {
    test("reads text into token list using default separators", () => {
        const reader = new ListCommandReader();

        const session = new CommandParseSession({
            argsText: "alpha beta gamma"
        });

        expect(reader.read(session)).toEqual(["alpha", "beta", "gamma"]);
    });

    test("reads text with quoted values preserved", () => {
        const reader = new ListCommandReader();

        const session = new CommandParseSession({
            argsText: 'one "two three" four'
        });

        const list = reader.read(session);
        expect(list.length).toBe(3);
        expect(list[0]).toBe("one");
        expect(list[1].value).toBe("two three");
        expect(list[2]).toBe("four");
    });

    test("reads text using custom separators", () => {
        const reader = new ListCommandReader({
            separator: ","
        });

        const session = new CommandParseSession({
            argsText: "a,b,c"
        });

        expect(reader.read(session)).toEqual(["a", "b", "c"]);
    });

    test("does not advance session argsIndex", () => {
        const reader = new ListCommandReader();

        const session = new CommandParseSession({
            argsText: "1 2 3"
        });

        session.argsIndex = 0;
        reader.read(session);
        expect(session.argsIndex).toBe(0);
    });
});
