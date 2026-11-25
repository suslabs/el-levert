import { describe, expect, test, vi } from "vitest";

import AICallLedger from "../../../src/structures/ai/AICallLedger.js";

describe("AICallLedger", () => {
    test("reuses search results across whitespace, case, and argument order", async () => {
        const ledger = new AICallLedger({ getMaxCalls: () => Infinity });
        const result = { results: [{ title: "Steel Age" }] };
        const execute = vi.fn().mockResolvedValue(result);

        await ledger.run({ name: "search_quests", args: { query: "Steel Age", expert: false } }, execute);
        const repeated = await ledger.run(
            { name: "search_quests", args: { expert: false, query: " steel   age " } },
            execute
        );

        expect(repeated).toMatchObject({ repeated: true, result });
        expect(execute).toHaveBeenCalledOnce();
    });

    test("runs distinct calls for case-sensitive scripts, paths, and attachment contents", async () => {
        const ledger = new AICallLedger({ getMaxCalls: () => Infinity });
        const execute = vi.fn().mockResolvedValue({ ok: true });

        const pairs = [
            [
                { name: "execute_javascript", args: { code: '"A"' } },
                { name: "execute_javascript", args: { code: '"a"' } }
            ],
            [
                { name: "fetch_web_page", args: { url: "https://example.test/A" } },
                { name: "fetch_web_page", args: { url: "https://example.test/a" } }
            ],
            [
                { name: "attach_file", args: { name: "answer.md", content: "Upper" } },
                { name: "attach_file", args: { name: "answer.md", content: "upper" } }
            ]
        ];

        for (const [first, second] of pairs) {
            await ledger.run(first, execute);
            await expect(ledger.run(second, execute)).resolves.toEqual({ ok: true });
        }

        expect(execute).toHaveBeenCalledTimes(pairs.length * 2);
    });
});
