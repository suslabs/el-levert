import { describe, expect, test } from "vitest";

import CommandArgument from "../../../../src/parsers/command/structs/CommandArgument.js";
import CommandParseSession from "../../../../src/parsers/command/structs/CommandParseSession.js";
import CommandQuotedValue from "../../../../src/parsers/command/structs/CommandQuotedValue.js";

import PositionalCommandReader from "../../../../src/parsers/command/reader/PositionalCommandReader.js";
import ListCommandReader from "../../../../src/parsers/command/reader/ListCommandReader.js";

import StringCommandType from "../../../../src/parsers/command/type/StringCommandType.js";
import IntegerCommandType from "../../../../src/parsers/command/type/IntegerCommandType.js";
import ScriptCommandType from "../../../../src/parsers/command/type/ScriptCommandType.js";

describe("CommandArgument", () => {
    test("normalizes input to lowercase when lowercase option is true", () => {
        const arg = new CommandArgument(
            "tag",
            "args",
            new PositionalCommandReader({ index: 0 }),
            new StringCommandType(),
            null,
            true,
            "string"
        );

        const session = new CommandParseSession({
            argsText: "MYTAG"
        });

        const result = arg.parse(session);
        expect(result.value).toBe("mytag");
    });

    test("normalizes CommandQuotedValue to lowercase", () => {
        const arg = new CommandArgument("tag", "args", null, new StringCommandType(), null, true, "string");

        const session = new CommandParseSession({});
        session.getSourceValue = () => new CommandQuotedValue("QUOTED TEXT", '"');

        const result = arg.parse(session);
        expect(result.value).toBe("quoted text");
    });

    test("validates required arguments", () => {
        const arg = new CommandArgument(
            "count",
            "args",
            new PositionalCommandReader({ index: 0 }),
            new IntegerCommandType(),
            { required: true },
            false,
            "integer"
        );

        const session = new CommandParseSession({
            argsText: ""
        });

        const result = arg.parse(session);
        expect(result.valid).toBe(false);
        expect(result.issues[0].code).toBe("required");
    });

    test("validates allowEmpty on strings", () => {
        const arg = new CommandArgument(
            "text",
            "args",
            null,
            new StringCommandType(),
            { required: true, allowEmpty: false },
            false,
            "string"
        );

        const session = new CommandParseSession({});
        session.getSourceValue = () => "";

        const result = arg.parse(session);
        expect(result.valid).toBe(false);
        expect(result.issues[0].code).toBe("empty");
    });

    test("validates min and max on integer values", () => {
        const arg = new CommandArgument(
            "count",
            "args",
            null,
            new IntegerCommandType(),
            { min: 5, max: 10 },
            false,
            "integer"
        );

        const session = new CommandParseSession({});

        session.getSourceValue = () => "3";
        expect(arg.parse(session).valid).toBe(false);

        session.getSourceValue = () => "15";
        expect(arg.parse(session).valid).toBe(false);

        session.getSourceValue = () => "7";
        expect(arg.parse(session).valid).toBe(true);
    });

    test("validates minLength and maxLength on string values", () => {
        const arg = new CommandArgument(
            "name",
            "args",
            null,
            new StringCommandType(),
            { minLength: 3, maxLength: 8 },
            false,
            "string"
        );

        const session = new CommandParseSession({});

        session.getSourceValue = () => "ab";
        expect(arg.parse(session).valid).toBe(false);

        session.getSourceValue = () => "waytoolongstring";
        expect(arg.parse(session).valid).toBe(false);

        session.getSourceValue = () => "perfect";
        expect(arg.parse(session).valid).toBe(true);
    });

    test("validates regex pattern constraints", () => {
        const arg = new CommandArgument(
            "code",
            "args",
            null,
            new StringCommandType(),
            { regex: /^[A-Z]{3}-\d{3}$/ },
            false,
            "string"
        );

        const session = new CommandParseSession({});

        session.getSourceValue = () => "invalid";
        expect(arg.parse(session).valid).toBe(false);

        session.getSourceValue = () => "ABC-123";
        expect(arg.parse(session).valid).toBe(true);
    });

    test("coerces list input elements individually", () => {
        const arg = new CommandArgument(
            "numbers",
            "args",
            new ListCommandReader({ kind: "list" }),
            new IntegerCommandType(),
            null,
            false,
            "integer"
        );

        const session = new CommandParseSession({
            argsText: "10 20 30"
        });

        const result = arg.parse(session);
        expect(result.valid).toBe(true);
        expect(result.value).toEqual([10, 20, 30]);
    });

    test("reader instance kind should default to constructor.kind", () => {
        const reader = new ListCommandReader();
        expect(reader.kind).toBe("list");
    });
});
