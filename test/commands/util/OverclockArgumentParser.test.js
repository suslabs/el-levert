import { describe, expect, test } from "vitest";

import OverclockArgumentParser from "../../../src/util/commands/OverclockArgumentParser.js";

import ParserError from "../../../src/errors/ParserError.js";

const parser = new OverclockArgumentParser();

describe("OverclockArgumentParser", () => {
    test("parses standard recipes without a mode", () => {
        expect(parser.parse(["120", "20s"])).toEqual({
            mode: "standard",
            eu: 120,
            duration: 400
        });
    });

    test("accepts standard as the first-level default mode", () => {
        expect(parser.parse(["standard", "120", "20s"])).toEqual({
            mode: "standard",
            eu: 120,
            duration: 400
        });
    });

    test("parses first-level modes and skipped optional values", () => {
        expect(parser.parse(["lcr", "120", "20s", "-", "-", "4", "2"])).toEqual({
            mode: "lcr",
            eu: 120,
            duration: 400,
            parallel: 4,
            amperage: 2
        });
    });

    test("parses EBF heat fields", () => {
        expect(parser.parse(["ebf", "1920", "60.3s", "3600", "5200", "4", "2"])).toEqual({
            mode: "ebf",
            eu: 1920,
            duration: 1206,
            recipeHeat: 3600,
            coilHeat: 5200,
            parallel: 4,
            amperage: 2
        });
    });

    test("reports malformed modes and fields with parser references", () => {
        expect(() => parser.parse(["badmode", "120", "20s"])).toThrow(ParserError);
        expect(() => parser.parse(["32"])).toThrow(ParserError);
        expect(() => parser.parse(["32", "nope"])).toThrow(ParserError);

        try {
            parser.parse(["ebf", "1920", "60s"]);
        } catch (err) {
            expect(err.ref).toEqual({
                reason: "missing_args",
                field: "recipeHeat"
            });
        }
    });
});
