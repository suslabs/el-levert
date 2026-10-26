import { describe, expect, test } from "vitest";

import RestCommandReader from "../../../../src/parsers/command/reader/RestCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";

describe("RestCommandReader", () => {
    test("reads remaining text from session argsIndex", () => {
        const reader = new RestCommandReader();

        const session = new CommandParseSession({
            argsText: "one two three four"
        });

        session.argsIndex = 1;

        expect(reader.read(session)).toBe("two three four");
        expect(session.argsIndex).toBe(4);
    });

    test("reads entire text when argsIndex is 0", () => {
        const reader = new RestCommandReader();

        const session = new CommandParseSession({
            argsText: "hello world"
        });

        expect(reader.read(session)).toBe("hello world");
        expect(session.argsIndex).toBe(2);
    });

    test("reads rest text containing apostrophes", () => {
        const reader = new RestCommandReader();

        const session = new CommandParseSession({
            argsText: "test1234 a'b don't stop"
        });

        session.argsIndex = 1;

        expect(reader.read(session)).toBe("a'b don't stop");
    });

    test("returns empty string when argsIndex is at or past end", () => {
        const reader = new RestCommandReader();

        const session = new CommandParseSession({
            argsText: "one two"
        });

        session.argsIndex = 2;

        expect(reader.read(session)).toBe("");
    });

    test("reads from non-args source directly without argsIndex manipulation", () => {
        const reader = new RestCommandReader({
            from: "custom"
        });

        const session = new CommandParseSession({
            argsText: "args text",
            custom: "custom raw content"
        });

        expect(reader.read(session)).toBe("custom raw content");
        expect(session.argsIndex).toBe(0);
    });

    test("returns empty string and resets argsIndex to 0 for empty input", () => {
        const reader = new RestCommandReader();

        const session = new CommandParseSession({
            argsText: "    "
        });

        expect(reader.read(session)).toBe("");
        expect(session.argsIndex).toBe(0);
    });
});
