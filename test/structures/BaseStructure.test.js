import { describe, expect, test } from "vitest";

import BaseStructure from "../../src/structures/BaseStructure.js";

class SampleStructure extends BaseStructure {
    static defaultValues = {
        name: "",
        tags: [],
        metadata: { priority: 1 },
        optional: ""
    };

    static dataProps = ["name", "tags", "metadata", "optional"];
    static nullableDataProps = ["optional"];
}

class ChildHookStructure extends SampleStructure {
    getData(data) {
        data.custom = true;
        return data;
    }

    clone(instance, overrides) {
        instance.hookRan = true;
        return instance;
    }
}

describe("BaseStructure", () => {
    test("instantiates with defaults and supports from factory", () => {
        const item = new SampleStructure({ name: "item1" });
        expect(item.name).toBe("item1");
        expect(item.tags).toEqual([]);
        expect(item.metadata).toEqual({ priority: 1 });

        expect(SampleStructure.from(item)).toBe(item);
        expect(SampleStructure.from(null, true)).toBeNull();

        const created = SampleStructure.from({ name: "item2" });
        expect(created).toBeInstanceOf(SampleStructure);
        expect(created.name).toBe("item2");
    });

    test("serializes via getData with prefix, nullable, and props filtering", () => {
        const item = new SampleStructure({ name: "item", tags: ["a"] });

        expect(item.getData()).toEqual({
            name: "item",
            tags: ["a"],
            metadata: { priority: 1 },
            optional: null
        });

        expect(item.getData("$", false, ["name", "optional"])).toEqual({
            $name: "item",
            $optional: ""
        });
    });

    test("clones instance with deep copied nested collections and overrides", () => {
        const original = new SampleStructure({
            name: "orig",
            tags: ["alpha", "beta"],
            metadata: { priority: 5 }
        });

        const cloned = original.clone({ name: "copy" });

        expect(cloned).toBeInstanceOf(SampleStructure);
        expect(cloned.name).toBe("copy");
        expect(cloned.tags).toEqual(["alpha", "beta"]);
        expect(cloned.metadata).toEqual({ priority: 5 });

        // Ensure deep clone independence
        cloned.tags.push("gamma");
        cloned.metadata.priority = 99;

        expect(original.tags).toEqual(["alpha", "beta"]);
        expect(original.metadata.priority).toBe(5);
    });

    test("supports child hooks for getData and clone", () => {
        const item = new ChildHookStructure({ name: "child" });

        expect(item.getData()).toEqual(
            expect.objectContaining({
                name: "child",
                custom: true
            })
        );

        const cloned = item.clone();
        expect(cloned.hookRan).toBe(true);
    });
});
