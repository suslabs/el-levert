import { describe, expect, test } from "vitest";

import { EmbedColors, defaultColor } from "../../../src/logger/discord/EmbedColors.js";

describe("EmbedColors", () => {
    test("exposes immutable level colors and a fallback color", () => {
        expect(EmbedColors.error).toBeTypeOf("number");
        expect(Object.isFrozen(EmbedColors)).toBe(true);
        expect(defaultColor).toBe(0xffffff);
    });
});
