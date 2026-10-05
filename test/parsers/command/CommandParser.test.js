import CommandParser from "../../../src/parsers/command/CommandParser.js";

describe("CommandParser", () => {
    test("parseInvocation parses basic command text", () => {
        const parsed = CommandParser.parseInvocation("!tag add alpha body", "!");

        expect(parsed).toEqual({
            raw: "!tag add alpha body",
            content: "tag add alpha body",
            name: "tag",
            argsText: "add alpha body"
        });
        expect(CommandParser.parseInvocation("!", "!")).toBeNull();
    });

    test("parses dashed options, quoted option values, and positional arguments", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "debug",
                    kind: "option",
                    type: "boolean"
                },
                {
                    name: "user",
                    kind: "option",
                    type: "integer",
                    aliases: ["u"]
                },
                {
                    name: "title",
                    kind: "option",
                    type: "string"
                },
                {
                    name: "first",
                    kind: "positional"
                },
                {
                    name: "rest",
                    kind: "rest"
                }
            ]
        });

        const session = parser.parse({
            argsText: 'hello --debug --user = 123 --title "alpha beta" world remaining tokens'
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("debug").value).toBe(true);
        expect(session.results.get("user").value).toBe(123);
        expect(session.results.get("title").value).toBe("alpha beta");
        expect(session.results.get("first").value).toBe("hello");
        expect(session.results.get("rest").value).toBe("world remaining tokens");
    });

    test("parses named and both-syntax options", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "mode",
                    kind: "option",
                    syntax: "named",
                    type: "string"
                },
                {
                    name: "limit",
                    kind: "option",
                    syntax: "both",
                    type: "integer"
                }
            ]
        });

        const session = parser.parse({
            argsText: "mode = top --limit=7"
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("mode").value).toBe("top");
        expect(session.results.get("limit").value).toBe(7);
    });

    test("treats bare boolean options as true and leaves following text untouched", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "debug",
                    kind: "option",
                    type: "boolean"
                },
                {
                    name: "first",
                    kind: "positional"
                }
            ]
        });

        const session = parser.parse({
            argsText: "--debug hello"
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("debug").value).toBe(true);
        expect(session.results.get("first").value).toBe("hello");
    });

    test("records duplicate options and keeps the last value", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "debug",
                    kind: "option",
                    type: "boolean"
                }
            ]
        });

        const session = parser.parse({
            argsText: "--debug false --debug true"
        });

        expect(session.valid).toBe(false);
        expect(session.results.get("debug").value).toBe(true);
        expect(session.issues).toHaveLength(1);
        expect(session.issues[0].code).toBe("duplicate_option");
    });

    test("keeps list reads independent from positional consumption", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "first",
                    kind: "positional"
                },
                {
                    name: "nums",
                    kind: "list",
                    type: "integer"
                },
                {
                    name: "rest",
                    kind: "rest"
                }
            ]
        });

        const session = parser.parse({
            argsText: "1 2 3"
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("first").value).toBe("1");
        expect(session.results.get("nums").value).toEqual([1, 2, 3]);
        expect(session.results.get("rest").value).toBe("2 3");
    });

    test("parses direct script values through the script type", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "body",
                    kind: "rest",
                    type: "script"
                }
            ]
        });

        const session = parser.parse({
            argsText: "```js\nconsole.log(1)\n```"
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("body").value).toEqual({
            body: "console.log(1)",
            language: "js",
            isScript: true
        });
    });

    test("reuses a shared match pattern across multiple arguments", () => {
        const pattern = /^(\S+)\s*(?:"([^"]*)")?\s*(.*)$/;

        let calls = 0;

        const exec = pattern.exec.bind(pattern);

        pattern.exec = text => {
            calls++;
            return exec(text);
        };

        const parser = new CommandParser({
            arguments: [
                {
                    name: "date",
                    reader: {
                        kind: "match",
                        pattern,
                        index: 1
                    }
                },
                {
                    name: "quote",
                    reader: {
                        kind: "match",
                        pattern,
                        index: 2
                    }
                },
                {
                    name: "message",
                    reader: {
                        kind: "match",
                        pattern,
                        index: 3
                    }
                }
            ]
        });

        const session = parser.parse({
            argsText: 'tomorrow "hello there" remaining words'
        });

        expect(session.valid).toBe(true);
        expect(session.results.get("date").value).toBe("tomorrow");
        expect(session.results.get("quote").value).toBe("hello there");
        expect(session.results.get("message").value).toBe("remaining words");
        expect(calls).toBe(1);
    });

    test("supports top-level validation shorthand", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "num",
                    kind: "positional",
                    type: "integer",
                    required: true,
                    valid: {
                        min: 5,
                        max: 10
                    }
                }
            ]
        });

        let session = parser.parse({
            argsText: "7"
        });

        expect(session.results.get("num").valid).toBe(true);
        expect(session.results.get("num").value).toBe(7);

        session = parser.parse({
            argsText: "12"
        });

        expect(session.results.get("num").valid).toBe(false);
        expect(session.results.get("num").issues[0].code).toBe("max");

        session = parser.parse({
            argsText: "abc"
        });

        expect(session.results.get("num").valid).toBe(false);
        expect(session.results.get("num").issues[0].code).toBe("invalid_integer");
    });

    test("handles unclosed quotes as validation issues instead of throwing", () => {
        const parser = new CommandParser({
            arguments: [
                {
                    name: "text",
                    kind: "positional"
                }
            ]
        });

        const session = parser.parse({
            argsText: 'hello "world'
        });

        expect(session.valid).toBe(false);
        expect(session.issues.length).toBe(1);
        expect(session.issues[0].code).toBe("unclosed_quote");
        expect(session.issues[0].message).toBe("Unclosed quote");
    });

    test("computes requireArgs from config and child arguments", () => {
        const noRequired = new CommandParser({
            arguments: [{ name: "opt", kind: "option", type: "string" }]
        });
        expect(noRequired.requireArgs).toBe(false);

        const configRequired = new CommandParser({
            info: { parser: { requireArgs: true } },
            arguments: [{ name: "opt", kind: "option", type: "string" }]
        });
        expect(configRequired.requireArgs).toBe(true);

        const argRequired = new CommandParser({
            arguments: [{ name: "text", kind: "positional", required: true }]
        });
        expect(argRequired.requireArgs).toBe(true);

        const validRuleRequired = new CommandParser({
            arguments: [{ name: "text", kind: "positional", valid: { required: true } }]
        });
        expect(validRuleRequired.requireArgs).toBe(true);
    });
});
