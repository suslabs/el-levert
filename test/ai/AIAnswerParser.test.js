import { describe, expect, test } from "vitest";

import AIAnswerParser from "../../src/ai/AIAnswerParser.js";

const ledger = sources => ({ has: source => sources.includes(source) });

describe("AIAnswerParser", () => {
    test("splits the answer from its follow-ups and verified sources", () => {
        const text = [
            "Use the **EBF**.",
            "[[EXTRAS]]",
            "Follow-ups:",
            "- what coils does it need",
            "- What coils does it need",
            "Sources:",
            "- tag:steel",
            "- https://invented.test"
        ].join("\n");

        expect(AIAnswerParser.parse(text, ledger(["tag:steel"]))).toEqual({
            answer: "Use the **EBF**.",
            followUps: ["What coils does it need?"],
            sources: ["tag:steel"]
        });
    });

    test("only treats the last marker as the block", () => {
        const text = "Write `[[EXTRAS]]` in a tag.\n[[EXTRAS]]\nFollow-ups:\n- What next?\nSources:";

        expect(AIAnswerParser.parse(text, ledger([]))).toEqual({
            answer: "Write `[[EXTRAS]]` in a tag.",
            followUps: ["What next?"],
            sources: []
        });
    });

    test("handles answers without the block", () => {
        expect(AIAnswerParser.parse("Just text.", ledger([]))).toEqual({
            answer: "Just text.",
            followUps: [],
            sources: []
        });
    });

    test("hides the block and a partly streamed marker from the preview", () => {
        expect(AIAnswerParser.getPreview("Answer.\n[[EXTRAS]]\nFollow-ups:")).toBe("Answer.\n");
        expect(AIAnswerParser.getPreview("Answer.\n[[EXT")).toBe("Answer.\n");
        expect(AIAnswerParser.getPreview("Answer [x]")).toBe("Answer [x]");
    });
});
