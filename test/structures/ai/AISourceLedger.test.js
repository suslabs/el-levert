import { describe, expect, test } from "vitest";

import AISourceLedger from "../../../src/structures/ai/AISourceLedger.js";

describe("AISourceLedger", () => {
    test("collects nested source and url values from tool output", () => {
        const ledger = new AISourceLedger();

        ledger.record({
            results: { tags: [{ source: "tag:steel", body: "https://not-a-source.test" }] },
            web: [{ title: "Page", url: "https://example.test/page" }],
            source: ""
        });

        ledger.record([{ source: "https://example.test/other" }, "loose string", null]);

        expect(ledger.toArray()).toEqual(["tag:steel", "https://example.test/page", "https://example.test/other"]);
        expect(ledger.has("tag:steel")).toBe(true);
        expect(ledger.has("https://not-a-source.test")).toBe(false);
    });
});
