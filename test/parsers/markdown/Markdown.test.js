import { describe, expect, test } from "vitest";

import MarkdownParser from "../../../src/parsers/markdown/MarkdownParser.js";
import MarkdownStyler from "../../../src/parsers/markdown/MarkdownStyler.js";
import MarkdownStyles from "../../../src/parsers/markdown/MarkdownStyles.js";

describe("Markdown", () => {
    test("splits text into sections by heading level", () => {
        const text = "intro\n## First\nA\n\n### Sub\nB\n## Second\nC";

        expect(MarkdownParser.splitSections(text)).toEqual([
            { title: "intro", text: "" },
            { title: "First", text: "A\n\n### Sub\nB" },
            { title: "Second", text: "C" }
        ]);

        expect(MarkdownParser.splitSections("### Sub\nB", 3)).toEqual([{ title: "Sub", text: "B" }]);
    });

    test("opens, closes and resets nested styles in order", () => {
        const styler = new MarkdownStyler();

        expect(styler.start(MarkdownStyles.bold)).toBe("**");
        expect(styler.start(MarkdownStyles.bold)).toBe("");
        expect(styler.start(MarkdownStyles.italic)).toBe("*");
        expect(styler.end(MarkdownStyles.bold)).toBe("****");
        expect(styler.styles).toEqual(["*"]);
        expect(styler.end(MarkdownStyles.strike)).toBe("");
        expect(styler.reset()).toBe("*");
        expect(styler.reset()).toBe("");
    });
});
