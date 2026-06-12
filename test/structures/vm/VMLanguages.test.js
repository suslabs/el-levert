import { describe, expect, test } from "vitest";

import UtilError from "../../../src/errors/UtilError.js";
import { VMLanguages, normalizeVMLanguage, resolveVMLanguage } from "../../../src/structures/vm/VMLanguages.js";

describe("VMLanguages", () => {
    test("resolves canonical names and the ts codeblock alias", () => {
        expect(VMLanguages).toEqual({
            js: "js",
            ts: "ts"
        });

        expect(resolveVMLanguage("js")).toBe(VMLanguages.js);
        expect(resolveVMLanguage("ts")).toBe(VMLanguages.ts);
        expect(resolveVMLanguage(" TypeScript ")).toBe(VMLanguages.ts);
    });

    test("uses the provided fallback for non-language codeblock flags", () => {
        expect(resolveVMLanguage(undefined, VMLanguages.js)).toBe(VMLanguages.js);
        expect(resolveVMLanguage(null, VMLanguages.js)).toBe(VMLanguages.js);
        expect(resolveVMLanguage("", VMLanguages.js)).toBe(VMLanguages.js);
        expect(resolveVMLanguage("py", VMLanguages.js)).toBe(VMLanguages.js);
    });

    test("throws util errors for invalid explicit vm languages", () => {
        expect(normalizeVMLanguage("typescript")).toBe(VMLanguages.ts);
        expect(() => normalizeVMLanguage("py")).toThrow(UtilError);
        expect(() => normalizeVMLanguage("")).toThrow("Invalid language");
        expect(() => normalizeVMLanguage(null)).toThrow("Invalid language");
    });
});
