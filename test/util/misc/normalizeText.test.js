import { describe, expect, test } from "vitest";

import normalizeText from "../../../src/util/misc/normalizeText.js";

describe("normalizeText", () => {
    test("normalizes lookalike unicode characters and combining marks", () => {
        expect(normalizeText("Plain-Text_26")).toBe("plain-text_26");
        expect(normalizeText("ⒶⓑＣ e\u0301")).toBe("abc e");
        expect(normalizeText("⓪①②")).toBe("o12");
    });
});
