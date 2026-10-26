import { describe, expect, test } from "vitest";

import CommandArgumentSchema from "../../../src/parsers/command/schema/CommandArgumentSchema.js";

import CommandReaderKinds from "../../../src/parsers/command/reader/CommandReaderKinds.js";
import CommandTypeNames from "../../../src/parsers/command/type/CommandTypeNames.js";

import CommandError from "../../../src/errors/CommandError.js";

describe("CommandArgumentSchema", () => {
    test("compiles valid schemas into canonical form", () => {
        const schema = [
            {
                name: "user",
                kind: CommandReaderKinds.option,
                type: CommandTypeNames.string,
                aliases: ["u"],
                shorthand: "x"
            }
        ];

        expect(CommandArgumentSchema.compile(schema)).toEqual([
            {
                name: "user",
                from: "args",
                type: CommandTypeNames.string,
                reader: {
                    kind: CommandReaderKinds.option,
                    aliases: ["u"],
                    shorthand: "x"
                }
            }
        ]);
    });

    test("normalizes top-level required shorthand into valid", () => {
        const schema = [
            {
                name: "count",
                kind: CommandReaderKinds.positional,
                type: CommandTypeNames.integer,
                required: true
            }
        ];

        const [arg] = CommandArgumentSchema.compile(schema);

        expect(arg.valid).toEqual({
            required: true
        });
        expect(Object.hasOwn(arg, "required")).toBe(false);
    });

    test("throws on conflicting required validation declarations", () => {
        const schema = [
            {
                name: "count",
                kind: CommandReaderKinds.positional,
                type: CommandTypeNames.integer,
                required: false,
                valid: {
                    required: true
                }
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });

    test("throws when non-required validation shorthand is declared top-level", () => {
        const schema = [
            {
                name: "count",
                kind: CommandReaderKinds.positional,
                type: CommandTypeNames.integer,
                min: 1
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });

    test("throws CommandError on invalid schema", () => {
        const schema = [
            {
                name: "user",
                kind: CommandReaderKinds.option,
                reader: {
                    kind: CommandReaderKinds.rest
                }
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });

    test("throws when reader and parser shorthand are mixed", () => {
        const schema = [
            {
                name: "user",
                aliases: ["user-id"],
                reader: {
                    kind: CommandReaderKinds.option
                }
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });

    test("throws when top-level parser shorthand omits kind", () => {
        const schema = [
            {
                name: "user",
                aliases: ["user-id"],
                type: CommandTypeNames.string
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });

    test("throws CommandError on mixed enum types", () => {
        const schema = [
            {
                name: "mode",
                type: {
                    name: CommandTypeNames.enum,
                    values: ["all", 42]
                }
            }
        ];

        expect(() => CommandArgumentSchema.compile(schema)).toThrow(CommandError);
    });
});
