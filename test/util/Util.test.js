import { Buffer } from "node:buffer";

import { afterEach, describe, expect, test, vi } from "vitest";

import Util from "../../src/util/Util.js";
import LengthTypes from "../../src/util/LengthTypes.js";
import CountTypes from "../../src/util/CountTypes.js";

afterEach(async () => {
    vi.restoreAllMocks();
});

describe("Util", () => {
    test("parses numbers and booleans with defaults", () => {
        expect(Util.parseInt(" ff ", 16)).toBe(255);
        expect(Util.parseInt("1,234", 10)).toBe(1234);
        expect(Number.isNaN(Util.parseInt("xyz", 10))).toBe(true);
        expect(Util.parseInt("xyz", 10, 7)).toBe(7);
        expect(Util.parseBool(" YES ")).toBe(true);
        expect(Util.parseBool("No")).toBe(false);
        expect(Util.parseBool("maybe", "fallback")).toBe("fallback");
    });

    test("formats and transforms strings", () => {
        expect(Util.formatNumber(1.23456, 2)).toBe("1.23");
        expect(Util.formatNumber(1e25, 2)).toContain("e");
        expect(Util.splitAt("alpha beta")).toEqual(["alpha", " beta"]);
        expect(Util.stripSpaces(" a \n b ")).toBe("ab");
        expect(Util.splitChars("hello")).toEqual(["h", "e", "l", "l", "o"]);
        expect(Util.capitalize("  hello  ")).toBe("  Hello  ");
        expect(Util.uncapitalize("  Hello  ")).toBe("  hello  ");
        expect(Util.toggleCase("Hello World!")).toBe("hELLO wORLD!");
        expect(Util.hasDuplicates("abba")).toBe(true);
        expect(Util.unique("abca")).toBe("abc");
        expect(Util.removeStringRange("abcdef", 2, 2)).toBe("abef");
        expect(Util.replaceStringRange("abcdef", "XY", 2, 2)).toBe("abXYef");
        expect(Util.maskRanges("abcdef", [[1, 3]])).toBe("a  def");
        expect(
            Util.maskRanges("abcdef", [
                [4, 6],
                [1, 3]
            ])
        ).toBe("a  d  ");
        expect(
            Util.maskRanges("abcdef", [
                [1, 4],
                [3, 5]
            ])
        ).toBe("a    f");
        expect(
            Util.maskRanges(
                "abcdef",
                [
                    [-2, 2],
                    [8, 10]
                ],
                "_"
            )
        ).toBe("__cdef");
        expect(Util.findNthCharacter("a-b-c-d", "-", 3)).toBe(5);
        expect(Util.hasPrefix(["pre", "x"], "prefix")).toBe(true);
    });

    test("counts and trims content", () => {
        expect(Util.utf8ByteLength("A")).toBe(1);
        expect(Util.utf8ByteLength("é")).toBe(2);
        expect(Util.countChars("abc")).toBe(3);
        expect(Util.countLines("a\nb\nc")).toBe(3);
        expect(Util.getCount("a\nb", CountTypes.lines)).toBe(2);
        expect(() => Util.getCount("x", "bad")).toThrow("Invalid count type");
        expect(Util.overSizeLimits("abcdef", 4)).toEqual([6, null]);
        expect(Util.overSizeLimits("a\nb\nc", null, 2)).toEqual([null, 3]);
        expect(Util.trimString("abcdef", 4)).toBe("abcd...");
        expect(Util.trimString("abcdef", 4, null, 5)).toBe("abcd...");
        expect(Util.trimString("abcdef", 5, null, { showDiff: true })).toContain("more character");
        expect(Util.trimString("a\nb\nc", 50, 2, { showDiff: true })).toContain("more line");
    });

    test("works with lengths, slices, and setters", () => {
        expect(Util.length([1, 2, 3])).toBe(3);
        expect(Util.stringLength(10)).toBe(2);
        expect(Util.getLength([1], LengthTypes.array)).toBe(1);
        expect(() => Util.getLength("x", "bad")).toThrow("Invalid length type");
        expect(Util.nonemptyString("x")).toBe(true);
        expect(Util.nonemptyString(["x"])).toBe(false);
        expect(Util.nonemptyString(0)).toBe(false);
        expect(Util.empty([])).toBe(true);
        expect(Util.empty({ length: 1 })).toBe(false);
        expect(Util.empty({})).toBe(true);
        expect(Util.single([1])).toBe(true);
        expect(Util.multiple([1, 2])).toBe(true);
        expect(Util.first("abcd", 1, 2)).toBe("bc");
        expect(Util.last("abcd", 0, 2)).toBe("cd");
        expect(Util.after("abcd", 1)).toBe("cd");
        expect(Util.before("abcd", -1)).toBe("abc");

        const arr = [1, 2, 3, 4];
        expect(Util.setFirst([...arr], 9, 1)).toEqual([1, 9, 3, 4]);
        expect(Util.setLast([...arr], 8, 1)).toEqual([1, 2, 8, 4]);
        expect(Util.setAfter([...arr], [7, 6], 1)).toEqual([1, 2, 7, 6]);
    });

    test("uses randomness helpers deterministically when Math.random is mocked", () => {
        vi.spyOn(Math, "random").mockReturnValue(0);

        expect(Util.random(3, 9)).toBe(3);
        expect(Util.randomElement("abcd", 0, 4, 2)).toEqual(["a", "a"]);
        expect(Util.randomString(3)).toBe("000");
        expect(Util.setRandomElement([1, 2, 3], 9, 0, 3)).toEqual([9, 2, 3]);
        expect(Util.deviate(10, 2)).toBe(8);
    });

    test("handles math, urls, dates, and durations", async () => {
        expect(Util.clamp(10, 0, 5)).toBe(5);
        expect(Util.round(1.2345, 2)).toBe(1.23);
        expect(Util.smallRound(0.000123, 2)).toBe(0.0001);
        expect(Util.approxEquals(0.1 + 0.2, 0.3, 1e-10)).toBe(true);
        expect(Util.countDigits(-255, 16)).toBe(2);
        expect(Util.numberToBytes(0x1234)).toEqual(new Uint8Array([0x34, 0x12]));
        expect(Util.numberToBytes(-1)).toBeNull();
        expect(Util.bytesToNumber(new Uint8Array([0x34, 0x12]))).toBe(0x1234);
        expect(Util.bytesToHex(new Uint8Array([0x34, 0x12]))).toBe("3412");
        expect(Util.bytesToHex([0x34, 0x12])).toBe("3412");
        expect(Util.bytesToHex(Buffer.from([0x34, 0x12]))).toBe("3412");
        expect(Util.bytesToHex(null)).toBe("");
        expect(Util.hexToBytes("3412")).toEqual(Buffer.from([0x34, 0x12]));
        expect(Util.hexToBytes("0x3412")).toEqual(Buffer.from([0x34, 0x12]));
        expect(Util.hexToBytes("312")).toEqual(Buffer.from([0x03, 0x12]));
        expect(Util.hexToBytes([0x34, 0x12])).toEqual(Buffer.from([0x34, 0x12]));
        expect(Util.hexToBytes(new Uint8Array([0x34, 0x12]))).toEqual(Buffer.from([0x34, 0x12]));
        expect(Util.hexToBytes(Buffer.from([0x34, 0x12]))).toEqual(Buffer.from([0x34, 0x12]));
        expect(Util.hexToBytes(null)).toEqual(Buffer.alloc(0));
        expect(Util.validUrl("https://example.com/test")).toBe(true);
        expect(Util.timeDelta(10n, 42n, 2n)).toBe(16n);
        expect(Util.duration(65_000)).toEqual({ minute: 1, second: 5 });
        expect(Util.duration(65_000, 5)).toEqual({ minute: 1, second: 5 });
        expect(Util.duration(65_000, { largestOnly: true, format: true })).toBe("1 minute");
        expect(Util.duration(65_000, { largestN: 1, format: true, whitelist: ["minute", "second"] })).toBe("1 minute");
        expect(Util.duration(65_000, { format: true })).toBe("1 minute, 5 seconds");
    });

    test("coordinates async helpers and timeouts", async () => {
        await expect(Util.delay(1)).resolves.toBeUndefined();
        await expect(Util.runWithTimeout(() => Promise.resolve("ok"), null, 10)).resolves.toBe("ok");
        await expect(Util.runWithTimeout(() => "sync", null, 0)).resolves.toBe("sync");
        await expect(
            Util.runWithTimeout(() => new Promise(resolve => setTimeout(() => resolve("late"), 20)), "Too slow", 1)
        ).rejects.toThrow("Too slow");
        await expect(Util.waitForCondition(() => true, null, 20, 1)).resolves.toBeUndefined();
        await expect(Util.waitForCondition(() => false, "Nope", 5, 1)).rejects.toThrow("Nope");
        await expect(
            Util.waitForCondition(
                () => {
                    throw new Error("boom");
                },
                null,
                5,
                1
            )
        ).rejects.toThrow("boom");

        expect(Util.maybeAsyncThen(2, value => value + 1)).toBe(3);
        await expect(Util.maybeAsyncThen(Promise.resolve(2), value => value + 2)).resolves.toBe(4);
        expect(
            Util.maybeAsyncThen(
                1,
                () => {
                    throw new Error("fail");
                },
                err => err.message
            )
        ).toBe("fail");
    });

    test("allows timeout timers to be cleared externally", async () => {
        let timeoutData = null;

        await expect(
            Util.runWithTimeout(
                () =>
                    new Promise(resolve => {
                        setTimeout(() => {
                            timeoutData.clearTimer();
                        }, 2);

                        setTimeout(() => resolve("late"), 20);
                    }),
                "Too slow",
                5,
                {
                    timeoutControls: data => {
                        timeoutData = data;
                    }
                }
            )
        ).resolves.toBe("late");
    });

    test("formats duration and handles units", () => {
        expect(Util.duration(5000)).toEqual({ second: 5 });
        expect(Util.duration(5000, { format: true })).toBe("5 seconds");
        expect(Util.duration(1000, { format: true })).toBe("1 second");
        expect(Util.duration(5000, { format: true, short: true })).toBe("5s");
        expect(Util.duration(65000, { format: true, short: true })).toBe("1m, 5s");
        expect(Util.duration(65000, { format: true, short: true, largestOnly: true })).toBe("1m");
        expect(Util.duration(5000, { unit: "second", format: true, short: true })).toBe("5s");
        expect(Util.duration(125000, { unit: "minute", format: true, digits: 2 })).toBe("2.08 minutes");
        expect(Util.duration(125000, { unit: "minute", format: true, short: true, digits: 2 })).toBe("2.08m");
        expect(() => Util.duration(5000, { unit: "invalid" })).toThrow();
    });

    test("formats byte sizes with formatSize", () => {
        expect(Util.formatSize(1024)).toBe("1 kilobyte");
        expect(Util.formatSize(2048)).toBe("2 kilobytes");
        expect(Util.formatSize(1024, { short: true })).toBe("1 KB");
        expect(Util.formatSize(1048576, { short: true })).toBe("1 MB");
        expect(Util.formatSize(2500, { unit: "kilobyte", short: true, digits: 2 })).toBe("2.44 KB");
        expect(Util.formatSize(1048576, { format: false })).toEqual({ megabyte: 1 });
        expect(() => Util.formatSize(1024, { unit: "bad" })).toThrow();
    });

    test("extracts error messages with getErrorMessage", () => {
        const errWithStack = new Error("something went wrong");
        expect(Util.getErrorMessage(errWithStack)).toBe(errWithStack.stack);

        expect(Util.getErrorMessage({ message: "custom error" })).toBe("custom error");
        expect(Util.getErrorMessage("direct error string")).toBe("direct error string");
        expect(Util.getErrorMessage(null)).toBe("No error message available");
        expect(Util.getErrorMessage(null, "custom fallback")).toBe("custom fallback");
    });

    test("compares primitives, buffers, and objects with sameValue", () => {
        expect(Util.sameValue(1, 1)).toBe(true);
        expect(Util.sameValue("str", "str")).toBe(true);
        expect(Util.sameValue(true, true)).toBe(true);
        expect(Util.sameValue(1, 2)).toBe(false);
        expect(Util.sameValue("a", "b")).toBe(false);
        expect(Util.sameValue(null, null)).toBe(true);
        expect(Util.sameValue(null, undefined)).toBe(false);
        expect(Util.sameValue(1, "1")).toBe(false);

        const buf1 = Buffer.from([1, 2, 3]),
            buf2 = Buffer.from([1, 2, 3]),
            buf3 = Buffer.from([1, 2, 4]),
            bufShort = Buffer.from([1, 2]);

        expect(Util.sameValue(buf1, buf2)).toBe(true);
        expect(Util.sameValue(buf1, buf3)).toBe(false);
        expect(Util.sameValue(buf1, bufShort)).toBe(false);
        expect(Util.sameValue(buf1, new Uint8Array([1, 2, 3]))).toBe(true);
        expect(Util.sameValue(buf1, new Uint8Array([1, 2, 4]))).toBe(false);

        const ab1 = new Uint8Array([1, 2, 3]).buffer,
            ab2 = new Uint8Array([1, 2, 3]).buffer,
            ab3 = new Uint8Array([1, 2, 4]).buffer;

        expect(Util.sameValue(ab1, ab2)).toBe(true);
        expect(Util.sameValue(ab1, ab3)).toBe(false);

        const u1 = new Uint8Array([10, 20]),
            u2 = new Uint8Array([10, 20]),
            u3 = new Uint8Array([10, 30]);

        expect(Util.sameValue(u1, u2)).toBe(true);
        expect(Util.sameValue(u1, u3)).toBe(false);

        expect(Util.sameValue({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
        expect(Util.sameValue({ a: 1 }, { a: 2 })).toBe(false);
        expect(Util.sameValue([1, 2], [1, 2])).toBe(true);
        expect(Util.sameValue([1, 2], [1, 3])).toBe(false);
    });
});
