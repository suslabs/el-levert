import { ButtonStyle } from "discord.js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import DiscordUtil from "../../../src/util/DiscordUtil.js";

import { cleanupRuntime, createCommandRuntime } from "../../helpers/commandHarness.js";

let runtime, view;

let AIReplyView, ComponentSession, AIPhases, AIError;

beforeEach(async () => {
    runtime = await createCommandRuntime({ config: { enableAI: true }, auth: { geminiKey: "test-key" } });

    ({ default: AIReplyView } = await import("../../../src/structures/ai/AIReplyView.js"));
    ({ default: ComponentSession } = await import("../../../src/structures/interaction/ComponentSession.js"));
    ({ default: AIPhases } = await import("../../../src/structures/ai/AIPhases.js"));
    ({ default: AIError } = await import("../../../src/errors/AIError.js"));

    view = new AIReplyView();
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

const embedOf = payload => payload.embeds[0].toJSON();

const cancelSession = { id: "cancel-1" };

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
                    { phase: AIPhases.reading, emoji: "🏷️", status: 'Reading tag "steel"' },
                    { phase: AIPhases.searching, emoji: "🌐", status: 'Searching the web for "test_*"' }
                ]),
                cancelSession
            )
        );

        expect(embed.author.name).toBe("Test Rabbit - Searching...");
        expect(embed.description).toBe('🏷️ *Reading tag "steel"...*\n🌐 *Searching the web for "test\\_\\*"...*');
        expect(embed.color).toBeUndefined();
    });

    test("previews the streamed answer and the finishing step", () => {
        const steps = [{ phase: AIPhases.searching, emoji: "🌐", status: 'Searching the web for "test"' }],
            embed = embedOf(
                view.renderProgress(session(steps, `Here are the results: ${"x".repeat(300)}`, true), cancelSession)
            );

        const [status, preview] = embed.description.split("\n\n"),
            [text, finishing] = preview.split("\n");

        expect(status).toBe('🌐 *Searching the web for "test"...*');
        expect(text).toHaveLength(AIReplyView.maxPreviewLength);
        expect(text.endsWith("...")).toBe(true);
        expect(finishing).toBe("*Finishing response...*");
    });

    test("status updates swap old buttons for a red cancel button and clear attachments", () => {
        const payload = view.renderThinking(cancelSession),
            [button] = payload.components[0].toJSON().components;

        expect(button).toMatchObject({ label: "Cancel", style: ButtonStyle.Danger, custom_id: "ai:cancel:cancel-1" });
        expect(payload.attachments).toEqual([]);
    });

    test("shows several images as a grid of embeds sharing one URL", () => {
        const images = ["https://img.test/a.png", "https://img.test/b.png"],
            payload = view.renderResult(
                {
                    answer: "Pics.",
                    sources: [],
                    followUps: [],
                    files: [],
                    images,
                    models: ["m"],
                    tokens: 1,
                    reasoning: 0,
                    elapsed: 12345
                },
                null
            );

        const embeds = payload.embeds.map(embed => embed.toJSON());

        expect(embeds.map(embed => [embed.url, embed.image.url])).toEqual([
            [images[0], images[0]],
            [images[0], images[1]]
        ]);
    });

    test("only shows the latest status lines", () => {
        const steps = Array.from({ length: 8 }, (_, i) => ({
                phase: AIPhases.running,
                emoji: "💻",
                status: `Step ${i}`
            })),
            lines = embedOf(view.renderProgress(session(steps), cancelSession)).description.split("\n");

        expect(lines).toHaveLength(AIReplyView.maxStatusLines);
        expect(lines.at(-1)).toBe("💻 *Step 7...*");
    });

    test("keeps sources and attaches the full answer when trimming a long one", () => {
        const payload = view.renderResult(
                {
                    answer: "a".repeat(5000),
                    sources: ["https://example.test/page"],
                    followUps: [],
                    files: [],
                    images: [],
                    models: ["test-model"],
                    tokens: 1234567,
                    reasoning: 0,
                    elapsed: 12345
                },
                null
            ),
            embed = embedOf(payload);

        expect(DiscordUtil.embedComponentsOverSizeLimit(embed, { total: DiscordUtil.embedCharLimit })).toBe(false);
        expect(embed.description.endsWith("Sources:\n1. https://example.test/page")).toBe(true);
        expect(embed.footer.text).toBe("Models: test-model | 1,234,567 tok | 12.3s");
        expect(payload.components).toEqual([]);
        expect(payload.attachments).toEqual([]);
        expect(payload.files.map(file => file.name)).toEqual(["answer.md"]);
        expect(payload.files[0].attachment.toString()).toBe("a".repeat(5000));
    });

    test("budgets for escaped mentions and saves an oversized source in the answer attachment", () => {
        const answer = "@everyone ".repeat(500).trim();
        const oversizedSource = `https://example.test/${"x".repeat(4500)}`;
        const payload = view.renderResult(
            {
                answer,
                sources: [oversizedSource, "Quest A"],
                followUps: ["What next?"],
                files: [],
                images: [],
                models: ["test-model"],
                tokens: 1,
                reasoning: 0,
                elapsed: 12345
            },
            null
        );
        const embed = embedOf(payload);
        embed.description = DiscordUtil.escapeMassMentions(embed.description);

        expect(DiscordUtil.embedComponentsOverSizeLimit(embed, { total: DiscordUtil.embedCharLimit })).toBe(false);
        expect(embed.description).toContain("Sources:\n1. Quest A");
        expect(embed.description).toContain("Follow-ups:\n1. What next?");
        expect(payload.files[0].attachment.toString()).toBe(`${answer}\n\nSources:\n1. ${oversizedSource}\n2. Quest A`);
    });

    test("gives the overflow attachment its own name when a tool already attached answer.md", () => {
        const answer = "a".repeat(5000);
        const payload = view.renderResult(
            {
                answer,
                sources: [],
                followUps: [],
                files: [{ name: "answer.md", content: "File from a tool." }],
                images: [],
                models: ["test-model"],
                tokens: 1,
                reasoning: 0,
                elapsed: 12345
            },
            null
        );

        expect(payload.files.map(file => [file.name, file.attachment.toString()])).toEqual([
            ["answer.md", "File from a tool."],
            ["answer-2.md", answer]
        ]);
    });

    test("fits oversized errors inside the entire embed budget", () => {
        const embed = embedOf(view.renderError(new AIError("verbose error ".repeat(400))));

        expect(DiscordUtil.embedComponentsOverSizeLimit(embed, { total: DiscordUtil.embedCharLimit })).toBe(false);
        expect(embed.description).toContain("Verbose error");
        expect(embed.description.endsWith("...")).toBe(true);
    });

    test("preserves bold in follow-ups and binds their buttons to the session", () => {
        const question = "Show me the **Distillation Tower** recipes for **Crude Oil**?";
        const followUps = [question, "Two_?"],
            session = new ComponentSession({ author: { id: "1" } }, { spec: { followUps, history: [] } });

        const payload = view.renderResult(
            {
                answer: "Answer.",
                sources: [],
                followUps,
                files: [],
                images: [],
                models: ["test-model"],
                tokens: 1,
                reasoning: 0,
                elapsed: 12345
            },
            session
        );

        const buttons = payload.components[0].toJSON().components;

        expect(embedOf(payload).description).toBe(`Answer.\n\nFollow-ups:\n1. ${question}\n2. Two\\_?`);
        expect(buttons.map(button => [button.label, button.custom_id])).toEqual([
            ["1", `ai:followup:0:${session.id}`],
            ["2", `ai:followup:1:${session.id}`]
        ]);
    });

    test("renders errors with a red border and no footer", () => {
        const embed = embedOf(view.renderError(new AIError("ran out of time")));

        expect(embed).toEqual({
            author: { name: "Test Rabbit", icon_url: "https://example.test/icon.png" },
            color: AIReplyView.errorColor,
            description: expect.stringContaining("Ran out of time.")
        });
    });

    test("reads expert mode back from an answer's footer", async () => {
        const { default: AIReplyView } = await import("../../../src/structures/ai/AIReplyView.js");

        const message = text => ({ embeds: [{ description: "Answer.", footer: { text } }] });

        expect(AIReplyView.isExpertAnswer(message("Models: m | 10 tok | 1s | Expert mode"))).toBe(true);
        expect(AIReplyView.isExpertAnswer(message("Models: m | 10 tok | 1s"))).toBe(false);
        expect(AIReplyView.isExpertAnswer({ embeds: [{ description: "No footer." }] })).toBe(false);
        expect(AIReplyView.isExpertAnswer({ embeds: [] })).toBe(false);
    });
});
