import { describe, expect, test } from "vitest";

import replEval from "../../../src/util/commands/replEval.js";

describe("replEval", () => {
    test("evaluates expressions with context and ignores dot-commands in the payload", async () => {
        await expect(replEval("value + 2", { value: 40 })).resolves.toBe(42);
        await expect(replEval(".help\nvalue * 2", { value: 21 })).resolves.toBe(42);
    });

    test("rejects thrown repl errors", async () => {
        await expect(replEval("throw new Error('boom')")).rejects.toThrow("boom");
    });
});
