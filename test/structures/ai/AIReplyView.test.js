import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime } from "../../helpers/commandHarness.js";

let runtime, view;

let AIReplyView, AIPhases, AIError;

beforeEach(async () => {
    runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

    ({ default: AIReplyView } = await import("../../../src/structures/ai/AIReplyView.js"));
    ({ default: AIPhases } = await import("../../../src/ai/AIPhases.js"));
    ({ default: AIError } = await import("../../../src/errors/AIError.js"));

    view = new AIReplyView();
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

const embedOf = payload => payload.embeds[0].toJSON();

const session = (steps, text = "", finishing = false) => ({
    phase: steps.at(-1)?.phase ?? AIPhases.thinking,
    steps,
    text,
    finishing
});

describe("AIReplyView", () => {
    test("shows the current phase in the header and each tool status", () => {
        const embed = embedOf(
            view.renderProgress(
                session([
                    { phase: AIPhases.reading, status: 'Reading tag "steel"' },
                    { phase: AIPhases.searching, status: 'Searching the web for "test_*"' }
                ])
            )
        );

        expect(embed.author.name).toBe("Test Rabbit - Searching...");
        expect(embed.description).toBe('▶️ *Reading tag "steel"...*\n▶️ *Searching the web for "test\\_\\*"...*');
        expect(embed.color).toBeUndefined();
    });

    test("previews the streamed answer and the finishing step", () => {
        const steps = [{ phase: AIPhases.searching, status: 'Searching the web for "test"' }],
            embed = embedOf(view.renderProgress(session(steps, `Here are the results: ${"x".repeat(300)}`, true)));

        const [status, preview] = embed.description.split("\n\n"),
            [text, finishing] = preview.split("\n");

        expect(status).toBe('▶️ *Searching the web for "test"...*');
        expect(text).toHaveLength(AIReplyView.maxPreviewLength);
        expect(text.endsWith("...")).toBe(true);
        expect(finishing).toBe("*Finishing response...*");
    });

    test("only shows the latest status lines", () => {
        const steps = Array.from({ length: 8 }, (_, i) => ({ phase: AIPhases.running, status: `Step ${i}` })),
            lines = embedOf(view.renderProgress(session(steps))).description.split("\n");

        expect(lines).toHaveLength(AIReplyView.maxStatusLines);
        expect(lines.at(-1)).toBe("▶️ *Step 7...*");
    });

    test("keeps sources and follow-ups when trimming a long answer", () => {
        const embed = embedOf(
            view.renderResult({
                answer: "a".repeat(5000),
                sources: ["https://example.test/page"],
                followUps: ["One?", "Two_?"],
                model: "test-model",
                tokens: 1234567,
                reasoning: 0
            })
        );

        expect(embed.description.length).toBeLessThanOrEqual(4096);
        expect(embed.description.endsWith("Sources:\n1. https://example.test/page\n\n1️⃣ One?\n2️⃣ Two\\_?")).toBe(true);
        expect(embed.footer.text).toBe("Models: test-model | 1,234,567 tok, 0 reasoning");
    });

    test("renders errors with a red border and no footer", () => {
        const embed = embedOf(view.renderError(new AIError("ran out of time")));

        expect(embed).toEqual({
            author: { name: "Test Rabbit", icon_url: "https://example.test/icon.png" },
            color: AIReplyView.errorColor,
            description: expect.stringContaining("Ran out of time.")
        });
    });
});
