import { describe, expect, test } from "vitest";

import { TagTypes } from "../../../src/structures/tag/TagTypes.js";

describe("TagTypes", () => {
    test("holds compact tag type definitions and derived names", () => {
        expect(TagTypes.types.text).toEqual({ script: false, flags: [["script", false]] });
        expect(TagTypes.types.ivm).toEqual({
            script: true,
            flags: [
                ["script", true],
                ["vm2", false]
            ]
        });
        expect(TagTypes.types.vm2).toEqual({
            script: true,
            flag: "vm2",
            flags: [
                ["script", true],
                ["vm2", true]
            ]
        });

        expect(TagTypes.types.names).toEqual(["text", "ivm", "vm2"]);
        expect(TagTypes.types.script).toEqual(["ivm", "vm2"]);
        expect(TagTypes.types.specialScript).toEqual(["vm2"]);
        expect(TagTypes.types.validScript).toEqual(new Set(["ivm", "vm2"]));

        expect(TagTypes.languages.js).toEqual({ flags: [["script", true]] });
        expect(TagTypes.languages.ts).toEqual({
            flag: "ts",
            value: true,
            flags: [
                ["script", true],
                ["ts", true]
            ]
        });
        expect(TagTypes.languages.flags).toEqual(["ts"]);
        expect(TagTypes.languages.matches.map(([name]) => name)).toEqual(["ts", "js"]);
    });

    test("defines requirements and default flags in one place", () => {
        expect(TagTypes.flags.ts.requires).toEqual({ script: true });
        expect(TagTypes.flags.vm2.requires).toEqual({ script: true });
        expect(TagTypes.flags.bits.get(TagTypes.flags.script.bit)).toBe("script");

        expect(TagTypes.defaults.flags).toEqual(
            new Map([
                ["new", true],
                ["script", false]
            ])
        );
        expect(TagTypes.defaults.meta).toEqual({
            version: "new",
            type: "text",
            language: "js"
        });
        expect(Object.isFrozen(TagTypes)).toBe(true);
    });
});
