import { describe, expect, test } from "vitest";

import StreamStep from "../../../src/structures/stream/StreamStep.js";

import TagError from "../../../src/errors/TagError.js";

describe("StreamStep", () => {
    test("parses step into name and args", () => {
        const step1 = StreamStep.parse("upper");
        expect(step1.name).toBe("upper");
        expect(step1.args).toBe("");
        expect(step1.isOperator()).toBe(true);

        const step2 = StreamStep.parse("echo_tag $ bar");
        expect(step2.name).toBe("echo_tag");
        expect(step2.args).toBe("$ bar");
        expect(step2.isOperator()).toBe(false);
    });

    test("throws TagError on empty step", () => {
        expect(() => StreamStep.parse("")).toThrow(TagError);
        expect(() => StreamStep.parse("   ")).toThrow(TagError);
    });

    test("formatArgs handles first step with and without initialInput", () => {
        const step = StreamStep.parse("my_tag foo bar");

        expect(step.formatArgs("", true, "")).toBe("foo bar");
        expect(step.formatArgs("piped", true, "init")).toBe("init foo bar");

        const placeholderStep = StreamStep.parse("my_tag prefix $ suffix");
        expect(placeholderStep.formatArgs("piped", true, "replaced")).toBe("prefix replaced suffix");
    });

    test("formatArgs handles subsequent steps prepending input or replacing $", () => {
        const step = StreamStep.parse("my_tag suffix");
        expect(step.formatArgs("input_text", false)).toBe("input_text suffix");

        const placeholderStep = StreamStep.parse("my_tag prefix $");
        expect(placeholderStep.formatArgs("input_text", false)).toBe("prefix input_text");
    });
});
