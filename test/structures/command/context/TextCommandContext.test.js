import { describe, expect, test } from "vitest";

import TextCommandContext from "../../../../src/structures/command/context/TextCommandContext.js";
import TextCommand from "../../../../src/structures/command/TextCommand.js";

import CommandError from "../../../../src/errors/CommandError.js";

class DummyCommand extends TextCommand {
    async handler(ctx) {
        return "ok";
    }
}

describe("TextCommandContext", () => {
    const dummyCommand = new DummyCommand({
        name: "dummy",
        arguments: [
            {
                name: "tagName",
                kind: "positional",
                index: 0
            },
            {
                name: "tagArgs",
                kind: "positional",
                index: 1
            }
        ]
    });

    test("arg() returns parsed argument values", () => {
        const ctx = new TextCommandContext({
            command: dummyCommand,
            argsText: "myname mybody"
        });

        expect(ctx.arg("tagName")).toBe("myname");
        expect(ctx.arg("tagArgs")).toBe("mybody");
    });

    test("arg() parses arguments containing apostrophes without crashing", () => {
        const ctx = new TextCommandContext({
            command: dummyCommand,
            argsText: "test1234 a'b"
        });

        expect(ctx.arg("tagName")).toBe("test1234");
        expect(ctx.arg("tagArgs")).toBe("a'b");
    });

    test("arg() surfaces parse issues (such as unclosed quote) instead of unknown argument name", () => {
        const ctx = new TextCommandContext({
            command: dummyCommand,
            argsText: 'test1234 "unclosed body'
        });

        // When an unclosed quote occurs, ctx.arg("tagName") should throw a CommandError
        // describing the unclosed quote, NOT claim that tagName is an unknown argument!
        expect(() => ctx.arg("tagName")).toThrow(/unclosed quote/i);
    });

    test("arg() throws CommandError for truly unknown argument names", () => {
        const ctx = new TextCommandContext({
            command: dummyCommand,
            argsText: "hello world"
        });

        expect(() => ctx.arg("nonExistentArg")).toThrow(CommandError);
        expect(() => ctx.arg("nonExistentArg")).toThrow(/Unknown argument name/);
    });
});
