import { describe, expect, test } from "vitest";

import OptionCommandReader from "../../../../src/parsers/command/reader/OptionCommandReader.js";

import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";

describe("OptionCommandReader", () => {
    test("reads dashed options and removes them from remainingText", () => {
        const reader = new OptionCommandReader({
            name: "mode",
            syntax: "dashed",
            type: "string"
        });

        const session = new CommandParseSession({
            argsText: "--mode strict other words"
        });

        expect(reader.read(session)).toBe("strict");
        expect(session.remainingText.trim()).toBe("other words");
    });

    test("reads options with quotes and embedded apostrophes", () => {
        const reader = new OptionCommandReader({
            name: "msg",
            syntax: "dashed",
            type: "string"
        });

        const session = new CommandParseSession({
            argsText: '--msg="it\'s a test" remaining'
        });

        expect(reader.read(session)).toBe("it's a test");
        expect(session.remainingText.trim()).toBe("remaining");
    });

    test("reads boolean flags and leaves remaining text untouched", () => {
        const reader = new OptionCommandReader({
            name: "force",
            syntax: "dashed",
            type: "boolean"
        });

        const session = new CommandParseSession({
            argsText: "--force mytag"
        });

        expect(reader.read(session)).toBe("true");
        expect(session.remainingText.trim()).toBe("mytag");
    });

    test("reports duplicate options", () => {
        const reader = new OptionCommandReader({
            name: "level",
            syntax: "dashed",
            type: "string"
        });

        const session = new CommandParseSession({
            argsText: "--level high --level low"
        });

        expect(reader.read(session)).toBe("low");
        expect(session.issues).toHaveLength(1);
        expect(session.issues[0].code).toBe("duplicate_option");
    });

    test("reads named syntax options (key=value)", () => {
        const reader = new OptionCommandReader({
            name: "tag",
            syntax: "named",
            type: "string"
        });

        const session = new CommandParseSession({
            argsText: "tag=test1234 other content"
        });

        expect(reader.read(session)).toBe("test1234");
        expect(session.remainingText.trim()).toBe("other content");
    });

    test("reads options with aliases and both syntax", () => {
        const reader = new OptionCommandReader({
            name: "output",
            aliases: ["out"],
            syntax: "both",
            type: "string"
        });

        const dashedSession = new CommandParseSession({
            argsText: "--out=file.txt tail"
        });
        expect(reader.read(dashedSession)).toBe("file.txt");
        expect(dashedSession.remainingText.trim()).toBe("tail");

        const namedSession = new CommandParseSession({
            argsText: "out=file2.txt tail"
        });
        expect(reader.read(namedSession)).toBe("file2.txt");
        expect(namedSession.remainingText.trim()).toBe("tail");
    });

    test("reads boolean option with explicit literal value", () => {
        const reader = new OptionCommandReader({
            name: "silent",
            syntax: "dashed",
            type: "boolean"
        });

        const sessionOff = new CommandParseSession({
            argsText: "--silent off myarg"
        });
        expect(reader.read(sessionOff)).toBe("off");
        expect(sessionOff.remainingText.trim()).toBe("myarg");

        const sessionZero = new CommandParseSession({
            argsText: "--silent 0 myarg"
        });
        expect(reader.read(sessionZero)).toBe("0");
        expect(sessionZero.remainingText.trim()).toBe("myarg");
    });
});
