import { describe, expect, test } from "vitest";

import CommandParser from "../../src/parsers/CommandParser.js";
import ParserError from "../../src/errors/ParserError.js";

describe("CommandParser", () => {
    test("parses command content for its bound context", () => {
        const parser = new CommandParser({
            content: "tag add alpha body",
            raw: "%tag add alpha body"
        });

        expect(parser.parse()).toEqual({
            raw: "%tag add alpha body",
            content: "tag add alpha body",
            name: "tag",
            argsText: "add alpha body"
        });
        expect(new CommandParser().parse()).toBeNull();
    });

    test("parses arguments for its bound context", () => {
        const parser = new CommandParser({
            argsText: "Hello 42",
            parseResult: {
                name: "demo"
            },
            command: {
                arguments: [
                    {
                        name: "label",
                        parser: "split",
                        index: 0
                    },
                    {
                        name: "amount",
                        parser: "split",
                        index: 1,
                        transform: "int"
                    },
                    {
                        name: "commandName",
                        from: "parseResult.name"
                    }
                ]
            }
        });

        expect(
            new CommandParser({
                content: "help tags",
                raw: "bridge %help tags"
            }).parse()
        ).toEqual({
            raw: "bridge %help tags",
            content: "help tags",
            name: "help",
            argsText: "tags"
        });

        expect(parser.parseArguments()).toEqual({
            label: "Hello",
            amount: 42,
            commandName: "demo"
        });
    });

    test("throws structured parser errors with refs", () => {
        const parser = new CommandParser({
            argsText: "value",
            command: {
                arguments: [
                    {
                        name: "broken",
                        parser: "mystery"
                    }
                ]
            }
        });

        expect(() => parser.parseArguments()).toThrow(ParserError);

        try {
            parser.parseArguments();
        } catch (err) {
            expect(err.name).toBe("ParserError");
            expect(err.message).toBe("Unknown command argument parser");
            expect(err.ref).toMatchObject({
                parser: "mystery",
                argument: "broken"
            });
        }
    });
});
