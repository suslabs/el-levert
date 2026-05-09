import { describe, expect, test } from "vitest";

import TypeTester from "../../src/util/TypeTester.js";

describe("TypeTester", () => {
    test("recognizes common runtime types and shapes", () => {
        class Example {
            method() {}
        }

        function Legacy() {}
        Legacy.prototype.method = () => {};

        expect(TypeTester.isObject({})).toBe(true);
        expect(TypeTester.isObject(null)).toBe(false);
        expect(TypeTester.isArray(new Uint8Array([1, 2]))).toBe(true);
        expect(TypeTester.isClass(Example)).toBe(true);
        expect(TypeTester.isClass(Legacy)).toBe(true);
        expect(TypeTester.isPromise(Promise.resolve())).toBe(true);
        expect(TypeTester.className(Example)).toBe("Example");
        expect(TypeTester.className(new Example())).toBe("Example");
    });

    test("validates character classes, numeric ranges, and nested property schemas", () => {
        expect(TypeTester.charType("A")).toBe("uppercase");
        expect(TypeTester.charType("z")).toBe("lowercase");
        expect(TypeTester.charType("5")).toBe("number");
        expect(TypeTester.charType(" ")).toBe("space");
        expect(TypeTester.charType("")).toBe("invalid");

        expect(
            TypeTester.isInRange(5, [
                [0, 4],
                [5, 9]
            ])
        ).toBe(true);
        expect(TypeTester.outOfRange("level", 1, 3, { level: 2 })).toBe(false);
        expect(TypeTester.outOfRange("level", 1, 3, { level: 2 }, { level: 9 })).toEqual({ level: 9 });

        expect(
            TypeTester.validateProps(
                {
                    id: 1,
                    meta: {
                        name: "ok"
                    }
                },
                {
                    id: "number",
                    meta: { name: "string" }
                }
            )
        ).toBe(true);
        expect(TypeTester.validateProps({ id: "1" }, { id: "number" })).toBe(false);
    });
});
