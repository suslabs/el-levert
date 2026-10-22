import { describe, expect, test } from "vitest";

import createEnum from "../../src/util/createEnum.js";

describe("createEnum", () => {
    test("creates enum from object with frozen non-enumerable metadata", () => {
        const Modes = createEnum({
            alpha: "a",
            beta: "b"
        });

        expect(Modes.alpha).toBe("a");
        expect(Modes.beta).toBe("b");
        expect(Object.isFrozen(Modes)).toBe(true);

        // Reflection
        expect(Object.keys(Modes)).toEqual(["alpha", "beta"]);
        expect(Object.values(Modes)).toEqual(["a", "b"]);

        // Precomputed metadata
        expect(Modes.keys).toEqual(["alpha", "beta"]);
        expect(Modes.values).toEqual(["a", "b"]);
        expect(Object.isFrozen(Modes.keys)).toBe(true);
        expect(Object.isFrozen(Modes.values)).toBe(true);

        // Validation
        expect(Modes.valid).toBeInstanceOf(Set);
        expect(Modes.valid.has("a")).toBe(true);
        expect(Modes.has("a")).toBe(true);
        expect(Modes.has("c")).toBe(false);

        // Iterable
        expect([...Modes]).toEqual(["a", "b"]);
    });

    test("creates enum from array of keys", () => {
        const Types = createEnum(["first", "second"]);

        expect(Types.first).toBe("first");
        expect(Types.second).toBe("second");
        expect(Types.keys).toEqual(["first", "second"]);
        expect(Types.values).toEqual(["first", "second"]);
        expect(Types.has("first")).toBe(true);
        expect(Types.has("third")).toBe(false);
    });

    test("handles collision with metadata property names gracefully", () => {
        const Collision = createEnum({
            keys: "customKeys",
            other: "otherVal"
        });

        expect(Collision.keys).toBe("customKeys");
        expect(Collision.other).toBe("otherVal");
        expect(Collision.has("customKeys")).toBe(true);
        expect(Collision.valid.has("customKeys")).toBe(true);
    });

    test("supports optional modifier to customize valid set and attach properties", () => {
        const Areas = createEnum(
            {
                body: "body",
                content: "content",
                all: "all"
            },
            obj => {
                obj.customGroup = new Set([obj.body]);
                return new Set(obj.values.filter(x => x !== obj.all));
            }
        );

        expect(Areas.valid.has("body")).toBe(true);
        expect(Areas.valid.has("all")).toBe(false);
        expect(Areas.has("all")).toBe(false);
        expect(Areas.customGroup.has("body")).toBe(true);
        expect(Object.isFrozen(Areas)).toBe(true);
    });
});
