import { describe, expect, test } from "vitest";

import { TagTypes } from "../../../src/structures/tag/TagTypes.js";

describe("TagTypes", () => {
    test("derives flag metadata from the flag schema", () => {
        expect(TagTypes.flags.entries).toEqual([
            ["new", TagTypes.flags.new],
            ["script", TagTypes.flags.script],
            ["vm2", TagTypes.flags.vm2]
        ]);
        expect(TagTypes.flags.names).toEqual(["new", "script", "vm2"]);
        expect(TagTypes.flags.bits).toEqual({
            new: 0,
            script: 1,
            vm2: 2
        });

        expect(TagTypes.flags.dependents.script).toEqual([
            {
                name: "vm2",
                value: true
            }
        ]);
        expect(TagTypes.flags.requires.vm2).toEqual([
            {
                name: "script",
                value: true
            }
        ]);
        expect(TagTypes.flags.clearedDependents.script).toEqual({
            false: ["vm2"],
            true: []
        });
        expect(TagTypes.flags.vm2.requiredFlags).toBe(TagTypes.flags.requires.vm2);
        expect(TagTypes.flags.script.clearedDependents).toBe(TagTypes.flags.clearedDependents.script);
        expect(TagTypes.flags.readonly).toEqual(["script"]);
        expect(TagTypes.flags.writable).toEqual(["vm2"]);
    });

    test("derives version and type metadata from their schemas", () => {
        expect(TagTypes.versions.entries).toEqual([
            ["old", TagTypes.versions.old],
            ["new", TagTypes.versions.new]
        ]);
        expect(TagTypes.versions.names).toEqual(["old", "new"]);
        expect(TagTypes.versions.valid.has(TagTypes.defaults.version)).toBe(true);

        expect(TagTypes.types.entries).toEqual([
            ["text", TagTypes.types.text],
            ["ivm", TagTypes.types.ivm],
            ["vm2", TagTypes.types.vm2]
        ]);
        expect(TagTypes.types.names).toEqual(["text", "ivm", "vm2"]);
        expect(TagTypes.types.script).toEqual(["ivm", "vm2"]);
        expect(TagTypes.types.validScript.has(TagTypes.defaults.scriptType)).toBe(true);
        expect(TagTypes.types.specialScript).toEqual(["vm2"]);
    });
});
