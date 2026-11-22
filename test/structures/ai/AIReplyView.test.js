import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { cleanupRuntime, createCommandRuntime } from "../../helpers/commandHarness.js";

let runtime, view;

let AIReplyView, AIFollowUpSession, AIPhases, AIError;

beforeEach(async () => {
    runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

    ({ default: AIReplyView } = await import("../../../src/structures/ai/AIReplyView.js"));
    ({ default: AIFollowUpSession } = await import("../../../src/structures/ai/AIFollowUpSession.js"));
    ({ default: AIPhases } = await import("../../../src/structures/ai/AIPhases.js"));
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

    test("keeps sources when trimming a long answer", () => {
        const payload = view.renderResult(
                {
                    answer: "a".repeat(5000),
                    sources: ["https://example.test/page"],
                    model: "test-model",
                    tokens: 1234567,
                    reasoning: 0
                },
                null
            ),
            embed = embedOf(payload);

        expect(embed.description.length).toBeLessThanOrEqual(4096);
        expect(embed.description.endsWith("Sources:\n1. https://example.test/page")).toBe(true);
        expect(embed.footer.text).toBe("Models: test-model | 1,234,567 tok, 0 reasoning");
        expect(payload.components).toEqual([]);
    });

    test("renders follow-ups as buttons bound to their session", () => {
        const followUps = new AIFollowUpSession({ author: { id: "1" } }, ["One?", "Two_?"], []);

        const payload = view.renderResult(
            { answer: "Answer.", sources: [], model: "test-model", tokens: 1, reasoning: 0 },
            followUps
        );

        const buttons = payload.components[0].toJSON().components;

        expect(embedOf(payload).description).toBe("Answer.");
        expect(buttons.map(button => [button.label, button.custom_id])).toEqual([
            ["One?", `ai_followup:0:${followUps.id}`],
            ["Two_?", `ai_followup:1:${followUps.id}`]
        ]);

        expect(followUps.getFollowUp(buttons[1].custom_id)).toBe("Two_?");
        expect(followUps.getFollowUp(`ai_followup:7:${followUps.id}`)).toBe(null);
        expect(followUps.getFollowUp(`snooze:1:${followUps.id}`)).toBe(null);
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
