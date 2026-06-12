import { Buffer } from "node:buffer";

import { describe, expect, test } from "vitest";

import TagBitField from "../../../src/structures/tag/TagBitField.js";

describe("TagBitField", () => {
    test("builds defaults from named flags and stores bytes", () => {
        const defaults = TagBitField.from(),
            stored = TagBitField.from(Buffer.from([3]));

        expect(TagBitField.from(stored)).toBe(stored);
        expect(defaults.toBuffer()).toEqual(Buffer.from([1]));
        expect(defaults.hasFlag("new")).toBe(true);
        expect(defaults.hasFlag("script")).toBe(false);

        expect(stored.toBuffer()).toEqual(Buffer.from([3]));
        expect(stored.hasFlag("new")).toBe(true);
        expect(stored.hasFlag("script")).toBe(true);
    });

    test("rejects scalar and undeclared stored flag data", () => {
        expect(() => TagBitField.from(3)).toThrow("Invalid type");
        expect(() => TagBitField.from(Buffer.from([16]))).toThrow("Invalid type");
    });

    test("uses inherited named mutations while enforcing requirements", () => {
        const type = TagBitField.from();

        expect(() => type.setFlag("ts")).toThrow("Flag ts requires script");
        expect(type.hasFlag("ts")).toBe(false);

        type.setFlag("script").setFlag("ts");

        expect(type.hasFlag("script")).toBe(true);
        expect(type.hasFlag("ts")).toBe(true);
        expect(() => type.setFlag("script", false)).toThrow("Flag ts requires script");
        expect(type.hasFlag("script")).toBe(true);
        expect(() => type.setFlag("missing")).toThrow("Unknown flag");
    });

    test("creates named filters without numeric type input", () => {
        const filter = TagBitField.filter(["script", "vm2"]),
            excluded = TagBitField.filter("script", false);

        expect(filter.toBuffer()).toEqual(Buffer.from([6]));
        expect(filter.include).toBe(true);
        expect(JSON.parse(TagBitField.query(filter).$types)).toEqual(expect.arrayContaining(["06", "07", "0e", "0f"]));
        expect(excluded.toBuffer()).toEqual(Buffer.from([2]));
        expect(excluded.include).toBe(false);
        expect(JSON.parse(TagBitField.query(excluded).$types)).toEqual(["00", "01"]);
        expect(JSON.parse(TagBitField.query().$types)).toEqual(
            expect.arrayContaining(["00", "01", "02", "03", "06", "07", "0a", "0b", "0e", "0f"])
        );
    });
});
