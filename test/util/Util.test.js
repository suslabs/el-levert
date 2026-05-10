import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import Util from "../../src/util/Util.js";
import LengthTypes from "../../src/util/LengthTypes.js";
import CountTypes from "../../src/util/CountTypes.js";

let tempDir;

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "el-levert-util-"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
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
        expect(Util.capitalize("  hello  ")).toBe("  Hello  ");
        expect(Util.camelCaseToWords("helloWorld")).toBe("hello world");
        expect(Util.wordsToCamelCase("HELLO world")).toBe("helloWorld");
        expect(Util.hasDuplicates("abba")).toBe(true);
        expect(Util.unique("abca")).toBe("abc");
        expect(Util.removeStringRange("abcdef", 2, 2)).toBe("abef");
        expect(Util.replaceStringRange("abcdef", "XY", 2, 2)).toBe("abXYef");
        expect(Util.maskRanges("abcdef", [[1, 3]])).toBe("a  def");
        expect(Util.maskRanges("abcdef", [[4, 6], [1, 3]])).toBe("a  d  ");
        expect(Util.maskRanges("abcdef", [[1, 4], [3, 5]])).toBe("a    f");
        expect(Util.maskRanges("abcdef", [[-2, 2], [8, 10]], "_")).toBe("__cdef");
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
        expect(Util.validUrl("https://example.com/test")).toBe(true);
        expect(() => Util.timeDelta(10n, 42n, 2n)).toThrow("Cannot convert a BigInt value to a number");
        expect(Util.duration(65_000)).toEqual({ second: 65 });
        expect(Util.duration(65_000, 5)).toEqual({ second: 65 });
        expect(Util.duration(65_000, { largestOnly: true, format: true })).toBe("65 seconds");
        expect(Util.duration(65_000, { largestN: 1, format: true, whitelist: ["minute", "second"] })).toBe(
            "65 seconds"
        );

        const dir = path.join(tempDir, "nested");
        await fs.mkdir(dir);

        expect(await Util.directoryExists(dir)).toBe(true);
        expect(await Util.directoryExists(path.join(tempDir, "missing"))).toBe(false);

        vi.spyOn(fs, "stat").mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
        await expect(Util.directoryExists("whatever")).rejects.toThrow("denied");
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
});
