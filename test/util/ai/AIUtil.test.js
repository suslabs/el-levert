import { describe, expect, test } from "vitest";

import AIUtil from "../../../src/util/ai/AIUtil.js";
import ToolParams from "../../../src/util/ai/ToolParams.js";

describe("AIUtil", () => {
    test("joins answer text from model parts without thoughts", () => {
        const parts = [{ text: "Hel" }, { text: "hidden", thought: true }, { functionCall: {} }, { text: "lo" }];
        expect(AIUtil.getText(parts)).toBe("Hello");
    });

    test("pages text with clamped bounds", () => {
        const text = "a".repeat(6000);

        expect(AIUtil.pageText(text)).toMatchObject({ offset: 0, nextOffset: 5000, totalChars: 6000 });
        expect(AIUtil.pageText(text, { offset: 5000 })).toMatchObject({ offset: 5000, nextOffset: null });
        expect(AIUtil.pageText(text, { offset: -5, maxChars: 1 }).text).toHaveLength(AIUtil.pageChars.min);
        expect(AIUtil.pageText(text, { maxChars: 99999 }).text).toHaveLength(6000);
    });

    test("cleans lists and formats questions", () => {
        expect(AIUtil.cleanList([" a ", "", "a", 3, null])).toEqual(["a", "3", "null"]);
        expect(AIUtil.cleanList(null)).toEqual([]);

        expect(AIUtil.formatQuestion("what is an ebf")).toBe("What is an ebf?");
        expect(AIUtil.formatQuestion("Tell me more.")).toBe("Tell me more.");
    });

    test("formats numbered lists and joins sections", () => {
        expect(AIUtil.formatList("Sources:", ["x", "y"])).toBe("Sources:\n1. x\n2. y");
        expect(AIUtil.formatList("Sources:", [])).toBe("");

        expect(AIUtil.joinSections("a", "", "b")).toBe("a\n\nb");
    });

    test("ToolParams describes paging with the AIUtil bounds", () => {
        expect(ToolParams.page()).toEqual({
            offset: { type: "integer", description: "Character offset to continue from." },
            maxChars: { type: "integer", description: "Characters to return, 500-8000 (default 5000)." }
        });
    });
});
