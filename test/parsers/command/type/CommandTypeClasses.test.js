import { describe, expect, test } from "vitest";

import {
    BaseCommandType,
    IntegerCommandType,
    NumberCommandType,
    BooleanCommandType,
    StringCommandType,
    EnumCommandType,
    ArrayCommandType,
    ObjectCommandType,
    GroupCommandType
} from "../../../../src/parsers/command/type/index.js";
import CommandQuotedValue from "../../../../src/parsers/command/structs/CommandQuotedValue.js";

describe("CommandTypeClasses", () => {
    test("IntegerCommandType coerces valid integers and rejects invalid ones", () => {
        const type = new IntegerCommandType();

        expect(type.coerce("42").value).toBe(42);
        expect(type.coerce("-10").value).toBe(-10);
        expect(type.coerce("").issue?.code).toBe("invalid_integer");
        expect(type.coerce("abc").issue?.code).toBe("invalid_integer");
        expect(type.coerce("12.34").issue?.code).toBe("invalid_integer");
    });

    test("NumberCommandType coerces floats, scientific notation, and numbers with commas", () => {
        const type = new NumberCommandType();

        expect(type.coerce("3.14").value).toBe(3.14);
        expect(type.coerce("-0.5").value).toBe(-0.5);
        expect(type.coerce("1e3").value).toBe(1000);
        expect(type.coerce("1,234.5").value).toBe(1234.5);
        expect(type.coerce("").issue?.code).toBe("invalid_number");
        expect(type.coerce("abc").issue?.code).toBe("invalid_number");
    });

    test("BooleanCommandType coerces truthy/falsy strings and rejects invalid", () => {
        const type = new BooleanCommandType();

        expect(type.coerce(true).value).toBe(true);
        expect(type.coerce("yes").value).toBe(true);
        expect(type.coerce("1").value).toBe(true);
        expect(type.coerce("on").value).toBe(true);
        expect(type.coerce("false").value).toBe(false);
        expect(type.coerce("no").value).toBe(false);
        expect(type.coerce("0").value).toBe(false);
        expect(type.coerce("off").value).toBe(false);
        expect(type.coerce("maybe").issue?.code).toBe("invalid_boolean");
    });

    test("StringCommandType unwraps CommandQuotedValue and converts to string", () => {
        const type = new StringCommandType();

        expect(type.coerce("hello").value).toBe("hello");
        expect(type.coerce(new CommandQuotedValue("inner text", '"')).value).toBe("inner text");
        expect(type.coerce(123).value).toBe("123");
    });

    test("EnumCommandType validates permitted values", () => {
        const strEnum = new EnumCommandType({ values: ["asc", "desc"] });

        expect(strEnum.coerce("asc").value).toBe("asc");
        expect(strEnum.coerce("desc").value).toBe("desc");
        expect(strEnum.coerce("invalid").issue?.code).toBe("invalid_enum");

        const numEnum = new EnumCommandType({ values: [1, 2, 3] });

        expect(numEnum.coerce("2").value).toBe(2);
        expect(numEnum.coerce("4").issue?.code).toBe("invalid_enum");
    });

    test("ArrayCommandType parses JSON arrays and rejects non-arrays", () => {
        const type = new ArrayCommandType();

        expect(type.coerce([1, 2]).value).toEqual([1, 2]);
        expect(type.coerce("[1, 2, 3]").value).toEqual([1, 2, 3]);
        expect(type.coerce('{"a": 1}').issue?.code).toBe("invalid_array");
        expect(type.coerce("not json").issue?.code).toBe("invalid_array");
    });

    test("ObjectCommandType parses JSON objects and rejects arrays or primitives", () => {
        const type = new ObjectCommandType();

        expect(type.coerce({ a: 1 }).value).toEqual({ a: 1 });
        expect(type.coerce('{"key": "value"}').value).toEqual({ key: "value" });
        expect(type.coerce("[1, 2]").issue?.code).toBe("invalid_object");
        expect(type.coerce("not json").issue?.code).toBe("invalid_object");
    });

    test("BaseCommandType parses JSON strings and preserves other values", () => {
        const type = new BaseCommandType();

        expect(type.coerce('{"key": 123}').value).toEqual({ key: 123 });
        expect(type.coerce("[1, 2, 3]").value).toEqual([1, 2, 3]);
        expect(type.coerce("{invalid json}").value).toBe("{invalid json}");
        expect(type.coerce("plain string").value).toBe("plain string");
        expect(type.coerce(null).value).toBeNull();
    });

    test("EnumCommandType handles empty values, boolean enums, and NaN numbers", () => {
        const emptyEnum = new EnumCommandType({ values: [] });
        expect(emptyEnum.coerce("anything").issue?.code).toBe("invalid_enum");

        const boolEnum = new EnumCommandType({ values: [true, false] });
        expect(boolEnum.coerce(true).value).toBe(true);
        expect(boolEnum.coerce("yes").value).toBe(true);
        expect(boolEnum.coerce("false").value).toBe(false);
        expect(boolEnum.coerce("maybe").issue?.code).toBe("invalid_enum");

        const numEnum = new EnumCommandType({ values: [10, 20] });
        expect(numEnum.coerce("not-a-number").issue?.code).toBe("invalid_enum");
    });

    test("GroupCommandType coerces objects and rejects primitives or arrays", () => {
        const type = new GroupCommandType();

        expect(type.coerce({ prop: "val" }).value).toEqual({ prop: "val" });
        expect(type.coerce([1, 2]).issue?.code).toBe("invalid_group");
        expect(type.coerce("string").issue?.code).toBe("invalid_group");
    });
});
