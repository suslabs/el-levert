import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";

import { TagTypes } from "../../../src/structures/tag/TagTypes.js";
import TagBitField from "../../../src/structures/tag/TagBitField.js";

describe("TagBitField", () => {
    test("uses the declarative schema for bits, filters, and queries", () => {
        const type = TagBitField.from(3);

        expect(TagBitField.is(type)).toBe(true);
        expect(type.get(TagTypes.flags.new.bit)).toBe(true);
        expect(type.get(TagTypes.flags.script.bit)).toBe(true);
        expect(type.toBuffer()).toEqual(Buffer.from([3]));
        expect(TagBitField.query(null)).toEqual({
            $flag: null
        });
    });

    test("normalizes inverted scalar filters", () => {
        const filter = TagBitField.filter(-2);

        expect(TagBitField.isFilter(filter)).toBe(true);
        expect(filter.toNumber()).toBe(-2);
        expect(TagBitField.query(filter)).toEqual({
            $flag: -2
        });
    });

    test("builds filters from flag names", () => {
        const flag = TagBitField.fromFlags(["script", null, "vm2"]);

        expect(flag.get(TagTypes.flags.script.bit)).toBe(true);
        expect(flag.get(TagTypes.flags.vm2.bit)).toBe(true);
        expect(TagBitField.filter("script", true).toNumber()).toBe(-2);
        expect(() => TagBitField.fromFlags("unknown")).toThrow("Unknown flag");
    });
});
