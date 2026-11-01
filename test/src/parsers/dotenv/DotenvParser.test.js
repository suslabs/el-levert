import { describe, expect, test } from "vitest";

import DotenvParser from "../../../../src/parsers/dotenv/DotenvParser.js";

describe("DotenvParser", () => {
    test("parses mixed dotenv syntax close to dotenv", () => {
        expect(
            DotenvParser.parse(`
                export A=alpha
                B = "line\\nvalue"
                C='quoted value'
                D: backtick
                E=test # comment
                F="hash # stays"
                G=trimmed
            `)
        ).toEqual({
            A: "alpha",
            B: "line\nvalue",
            C: "quoted value",
            D: "backtick",
            E: "test",
            F: "hash # stays",
            G: "trimmed"
        });
    });

    test("parses empty input, blank lines, and comment-only lines as empty output", () => {
        expect(DotenvParser.parse()).toEqual({});
        expect(DotenvParser.parse("")).toEqual({});
        expect(
            DotenvParser.parse(`

                # comment
                not a dotenv line

            `)
        ).toEqual({});
    });

    test("normalizes windows newlines and resets parser state across repeated calls", () => {
        expect(DotenvParser.parse("A=1\r\nB=2\r\n")).toEqual({
            A: "1",
            B: "2"
        });

        expect(DotenvParser.parse("C=3")).toEqual({
            C: "3"
        });
    });

    test("keeps the last value for repeated keys", () => {
        expect(
            DotenvParser.parse(`
                A=first
                A=second
                A="third"
            `)
        ).toEqual({
            A: "third"
        });
    });

    test("parses empty values and preserves escaping rules by quote type", () => {
        expect(
            DotenvParser.parse(`
                A=
                B=   
                C=""
                D=''
                E="line\\rvalue"
                F='line\\nvalue'
                G=\`line\\nvalue\`
            `)
        ).toEqual({
            A: "",
            B: "",
            C: "",
            D: "",
            E: "line\rvalue",
            F: "line\\nvalue",
            G: "line\\nvalue"
        });
    });

    test("accepts keys with dots, dashes, and underscores and ignores malformed lines", () => {
        expect(
            DotenvParser.parse(`
                APP.NAME=value
                APP-NAME=other
                APP_NAME=third
                NO_SPACE:bad
                =missing
                not dotenv
            `)
        ).toEqual({
            "APP.NAME": "value",
            "APP-NAME": "other",
            APP_NAME: "third"
        });
    });

    test("populates values without mutating the source env by default", () => {
        const env = {
            A: "env-a",
            C: "env-c"
        };

        expect(
            DotenvParser.populate(
                {
                    ...env
                },
                {
                    A: "file-a",
                    B: "file-b"
                }
            )
        ).toEqual({
            A: "env-a",
            B: "file-b",
            C: "env-c"
        });

        expect(env).toEqual({
            A: "env-a",
            C: "env-c"
        });
    });

    test("populate overrides only when asked and tolerates non-object inputs", () => {
        expect(
            DotenvParser.populate(null, {
                A: "file-a"
            })
        ).toEqual({
            A: "file-a"
        });

        expect(
            DotenvParser.populate(
                {
                    A: "env-a"
                },
                null,
                {
                    override: true
                }
            )
        ).toEqual({
            A: "env-a"
        });

        expect(
            DotenvParser.populate(
                {
                    A: "env-a"
                },
                {
                    A: "file-a"
                },
                {
                    override: true
                }
            )
        ).toEqual({
            A: "file-a"
        });
    });

    test("populate only checks own keys when deciding whether to overwrite", () => {
        const env = Object.create({
            A: "proto-a"
        });

        expect(
            DotenvParser.populate(env, {
                A: "file-a",
                B: "file-b"
            })
        ).toEqual({
            A: "file-a",
            B: "file-b"
        });
    });
});
