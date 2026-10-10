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

    test("normalizes enum values with custom errors and normalizers", () => {
        class CustomError extends Error {
            constructor(message, ref) {
                super(message);
                this.ref = ref;
            }
        }

        const values = Object.freeze({
            ok: "ok",
            yes: "yes"
        });

        expect(
            TypeTester.normalizeEnum("YES", values, "choice", CustomError, {
                normalize: value => value.toLowerCase()
            })
        ).toBe("yes");

        expect(TypeTester.normalizeEnum("ok", ["ok", "yes"], "choice")).toBe("ok");

        expect(() => TypeTester.normalizeEnum("", values, "choice", CustomError)).toThrow("Invalid choice");
        expect(() =>
            TypeTester.normalizeEnum("", values, "choice", CustomError, {
                missing: true
            })
        ).toThrow("No choice provided");

        expect(() =>
            TypeTester.normalizeEnum("no", values, "choice", CustomError, {
                unknown: "Bad"
            })
        ).toThrow("Bad choice: no");

        expect(() => TypeTester.normalizeEnum("no", values, "choice")).toThrow("Invalid choice: no");
        expect(TypeTester.normalizeEnums(["ok", "yes"], values, "choice")).toEqual(["ok", "yes"]);

        expect(() =>
            TypeTester.normalizeEnums(["ok", "no"], values, "choice", CustomError, {
                collectInvalid: true,
                unknown: "Bad"
            })
        ).toThrow("Bad choice: no");
    });

    test("test normalizeEnum with numeric, boolean, and empty values", () => {
        class CustomError extends Error {
            constructor(message, ref) {
                super(message);
                this.name = "CustomError";
                this.ref = ref;
            }
        }

        const numericValues = [16, 32, 64, 128, 256, 512];

        // Valid numbers (including 0)
        expect(TypeTester.normalizeEnum(128, numericValues, "size")).toBe(128);
        expect(TypeTester.normalizeEnum(16, numericValues, "size")).toBe(16);
        expect(TypeTester.normalizeEnum(0, [0, 1, 2], "index")).toBe(0);

        // Unknown numbers
        expect(() => TypeTester.normalizeEnum(999, numericValues, "size", CustomError)).toThrow("Invalid size: 999");
        expect(() => TypeTester.normalizeEnum(-1, numericValues, "size")).toThrow("Invalid size: -1");

        // Missing values (null, undefined, empty string)
        expect(() => TypeTester.normalizeEnum(null, numericValues, "size", CustomError)).toThrow("Invalid size");
        expect(() =>
            TypeTester.normalizeEnum(undefined, numericValues, "size", CustomError, {
                missing: true
            })
        ).toThrow("No size provided");
        expect(() => TypeTester.normalizeEnum("", numericValues, "size")).toThrow("Invalid size");

        // allowEmpty with empty string
        expect(
            TypeTester.normalizeEnum("", ["", "default"], "opt", CustomError, {
                allowEmpty: true
            })
        ).toBe("");

        // Boolean and BigInt enums
        expect(TypeTester.normalizeEnum(false, [false, true], "flag")).toBe(false);
        expect(TypeTester.normalizeEnum(true, [false, true], "flag")).toBe(true);
        expect(TypeTester.normalizeEnum(0n, [0n, 1n], "bigint")).toBe(0n);

        // normalizeEnums with numbers
        expect(TypeTester.normalizeEnums([16, 128], numericValues, "sizes")).toEqual([16, 128]);
        expect(() => TypeTester.normalizeEnums([16, 999], numericValues, "sizes")).toThrow("Invalid sizes: 999");
    });
});
