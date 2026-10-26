import { describe, expect, test } from "vitest";

import CommandTextLexer from "../../../src/parsers/command/CommandTextLexer.js";

import ParserError from "../../../src/errors/ParserError.js";

describe("CommandTextLexer", () => {
    test("exposes static quotes array", () => {
        expect(CommandTextLexer.quotes).toEqual(['"', "'"]);
    });

    test("lexes basic text and quotes", () => {
        const lexer = new CommandTextLexer('hello "world of code" end'),
            tokens = lexer.lex();

        expect(tokens.length).toBe(3);
        expect(tokens[0].value).toBe("hello");
        expect(tokens[1].type).toBe("quoted");
        expect(tokens[1].value.value).toBe("world of code");
        expect(tokens[2].value).toBe("end");
    });

    test("lexes statefully via nextToken and done", () => {
        const lexer = new CommandTextLexer('foo "bar" baz');

        expect(lexer.done).toBe(false);

        const first = lexer.nextToken();
        expect(first.value).toBe("foo");

        const second = lexer.nextToken();
        expect(second.value.value).toBe("bar");
        expect(second.type).toBe("quoted");

        const third = lexer.nextToken();
        expect(third.value).toBe("baz");

        const fourth = lexer.nextToken();
        expect(fourth).toBeNull();
        expect(lexer.done).toBe(true);
    });

    test("supports iteration via Symbol.iterator", () => {
        const lexer = new CommandTextLexer("one two three"),
            values = [];

        for (const token of lexer) {
            values.push(token.value);
        }

        expect(values).toEqual(["one", "two", "three"]);
    });

    test("lexes escaped quotes", () => {
        const lexer = new CommandTextLexer('alpha "quote \\" nested" beta'),
            tokens = lexer.lex();

        expect(tokens.length).toBe(3);
        expect(tokens[1].value.value).toBe('quote " nested');
    });

    test("preserves separators inside quotes", () => {
        const lexer = new CommandTextLexer('query "some --text = here" tail'),
            tokens = lexer.lex();

        expect(tokens.map(token => `${token.type}:${token.value}`)).toEqual([
            "text:query",
            "quoted:some --text = here",
            "text:tail"
        ]);
    });

    test("throws ParserError on unclosed quotes", () => {
        expect(() => new CommandTextLexer('hello "world').lex()).toThrow(ParserError);
        expect(() => new CommandTextLexer("hello 'world").lex()).toThrow(ParserError);
        expect(() => new CommandTextLexer('--opt="unclosed').lex()).toThrow(ParserError);
    });

    test("lexes words containing apostrophes without entering quote mode", () => {
        const lexer = new CommandTextLexer("test1234 a'b don't it's user's 5'11\" O'Connor"),
            tokens = lexer.lex();

        expect(tokens.map(t => t.value)).toEqual(["test1234", "a'b", "don't", "it's", "user's", "5'11\"", "O'Connor"]);
        expect(tokens.every(t => t.type === "text")).toBe(true);
    });

    test("preserves subsequent tokens after an unquoted word with an apostrophe", () => {
        const lexer = new CommandTextLexer("don't do that 'quoted value'"),
            tokens = lexer.lex();

        expect(tokens.length).toBe(4);
        expect(tokens[0].value).toBe("don't");
        expect(tokens[0].type).toBe("text");
        expect(tokens[1].value).toBe("do");
        expect(tokens[2].value).toBe("that");
        expect(tokens[3].type).toBe("quoted");
        expect(tokens[3].value.value).toBe("quoted value");
    });

    test("lexes words ending in apostrophes", () => {
        const lexer = new CommandTextLexer("users' rights"),
            tokens = lexer.lex();

        expect(tokens.map(t => t.value)).toEqual(["users'", "rights"]);
        expect(tokens.every(t => t.type === "text")).toBe(true);
    });

    test("lexes escaped quotes and spaces in unquoted text", () => {
        const lexer = new CommandTextLexer("a\\'b hello\\ world escaped\\\\backslash"),
            tokens = lexer.lex();

        expect(tokens.length).toBe(3);
        expect(tokens[0].value).toBe("a'b");
        expect(tokens[1].value).toBe("hello world");
        expect(tokens[2].value).toBe("escaped\\backslash");
    });

    test("lexes empty quotes", () => {
        const lexer = new CommandTextLexer("alpha \"\" '' beta"),
            tokens = lexer.lex();

        expect(tokens.length).toBe(4);
        expect(tokens[0].value).toBe("alpha");
        expect(tokens[1].type).toBe("quoted");
        expect(tokens[1].value.value).toBe("");
        expect(tokens[2].type).toBe("quoted");
        expect(tokens[2].value.value).toBe("");
        expect(tokens[3].value).toBe("beta");
    });

    test("lexes quotes following option assignment operators", () => {
        const lexer = new CommandTextLexer("--file=\"path with spaces\" --key='single quoted'"),
            tokens = lexer.lex();

        expect(tokens.length).toBe(2);
        expect(tokens[0].value).toBe("--file=path with spaces");
        expect(tokens[1].value).toBe("--key=single quoted");
    });

    test("lexes trailing unquoted backslash at end of string", () => {
        const lexer = new CommandTextLexer("trailing\\"),
            tokens = lexer.lex();

        expect(tokens.length).toBe(1);
        expect(tokens[0].value).toBe("trailing\\");
    });

    test("preserves non-quote escape character inside quotes", () => {
        const lexer = new CommandTextLexer('"hello\\world"'),
            tokens = lexer.lex();

        expect(tokens.length).toBe(1);
        expect(tokens[0].type).toBe("quoted");
        expect(tokens[0].value.value).toBe("hello\\world");
    });

    test("handles empty and whitespace-only strings gracefully", () => {
        expect(new CommandTextLexer("").lex()).toEqual([]);
        expect(new CommandTextLexer("    ").lex()).toEqual([]);
        expect(new CommandTextLexer(null).lex()).toEqual([]);
        expect(new CommandTextLexer(undefined).lex()).toEqual([]);
    });
});
