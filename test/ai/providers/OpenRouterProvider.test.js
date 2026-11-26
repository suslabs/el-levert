import { Buffer } from "node:buffer";
import { Readable } from "node:stream";

import { describe, expect, test } from "vitest";

import OpenRouterProvider from "../../../src/ai/providers/OpenRouterProvider.js";
import Util from "../../../src/util/Util.js";

const provider = new OpenRouterProvider(null, ["key"], { endpoint: "https://openrouter.test/api/v1" });

const sse = events =>
    Readable.from(
        events.map(event => Buffer.from(`data: ${typeof event === "string" ? event : JSON.stringify(event)}\n\n`))
    );

describe("OpenRouterProvider", () => {
    test("converts the bot's conversation to a chat request with tools", () => {
        const body = {
            systemInstruction: { parts: [{ text: "Be helpful." }] },
            contents: [
                { role: "user", parts: [{ text: "make pe" }] },
                {
                    role: "model",
                    parts: [{ text: "Searching." }, { functionCall: { name: "search_recipes", args: { query: "pe" } } }]
                },
                {
                    role: "user",
                    parts: [
                        { functionResponse: { name: "search_recipes", response: { found: true } } },
                        { text: "Tools are no longer available." }
                    ]
                }
            ],
            tools: [
                {
                    functionDeclarations: [
                        { name: "search_recipes", description: "Recipes.", parameters: { type: "object" } }
                    ]
                }
            ]
        };

        const request = provider.buildRequest("google/gemma:free", "sk-1", body, {
            stream: true,
            thinkingLevel: "low"
        });

        expect(request.url).toBe("https://openrouter.test/api/v1/chat/completions");
        expect(request.headers.authorization).toBe("Bearer sk-1");

        expect(request.data).toMatchObject({
            model: "google/gemma:free",
            stream: true,
            stream_options: { include_usage: true },
            tool_choice: "auto",
            tools: [{ type: "function", function: { name: "search_recipes" } }]
        });

        expect(request.data.messages).toEqual([
            { role: "system", content: "Be helpful." },
            { role: "user", content: [{ type: "text", text: "make pe" }] },
            {
                role: "assistant",
                content: "Searching.",
                tool_calls: [
                    {
                        id: "call_1_0",
                        type: "function",
                        function: { name: "search_recipes", arguments: '{"query":"pe"}' }
                    }
                ]
            },
            { role: "tool", tool_call_id: "call_1_0", content: '{"found":true}' },
            { role: "user", content: [{ type: "text", text: "Tools are no longer available." }] }
        ]);
    });

    test("requires the named tool when the session requests a specific call", () => {
        const body = {
            contents: [],
            tools: [{ functionDeclarations: [{ name: "search_quests", description: "Search quests." }] }],
            toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["search_quests"] } }
        };

        const request = provider.buildRequest("model", "key", body, { stream: true });

        expect(request.data.tool_choice).toEqual({ type: "function", function: { name: "search_quests" } });
    });

    test("reads streamed text and tool calls into the bot's parts", async () => {
        const streamed = [];

        const out = await provider.readStream(
            sse([
                { choices: [{ delta: { content: "Hel" } }] },
                { choices: [{ delta: { content: "lo", reasoning: "hidden" } }] },
                {
                    choices: [
                        {
                            delta: {
                                tool_calls: [{ index: 0, id: "c1", function: { name: "unit", arguments: '{"va' } }]
                            }
                        }
                    ]
                },
                {
                    choices: [
                        {
                            delta: { tool_calls: [{ index: 0, function: { arguments: 'lue":1}' } }] },
                            finish_reason: "tool_calls"
                        }
                    ]
                },
                { choices: [], usage: { total_tokens: 42, prompt_tokens_details: { cached_tokens: 10 } } },
                "[DONE]"
            ]),
            parts => streamed.push(...parts)
        );

        expect(streamed).toEqual([{ text: "Hel" }, { text: "lo" }]);
        expect(out).toEqual({
            parts: [{ text: "Hel" }, { text: "lo" }, { functionCall: { id: "c1", name: "unit", args: { value: 1 } } }],
            finishReason: "STOP",
            error: null,
            usage: { tokens: 42, cached: 10, reasoning: 0 }
        });
    });

    test("reports interrupted streams and reads retry headers", async () => {
        const out = await provider.readStream(
            sse([{ choices: [{ delta: { content: "Half" } }] }, { error: { message: "x" } }]),
            async () => {}
        );
        expect(out.finishReason).toBeNull();
        expect(out.error).toEqual({ message: "x" });

        expect(provider.getUnblockDelay({ status: 503, headers: { "retry-after": "30" } })).toBe(
            30 / Util.durationSeconds.milli
        );
        expect(provider.getUnblockDelay({ headers: {} })).toBeNull();

        const futureMs = Date.now() + 45 / Util.durationSeconds.milli;
        expect(
            provider.getUnblockDelay({
                status: 429,
                data: { error: { metadata: { headers: { "X-RateLimit-Reset": String(futureMs) } } } }
            })
        ).toBeGreaterThan(40 / Util.durationSeconds.milli);

        const futureSec = Math.floor(Date.now() * Util.durationSeconds.milli) + 25;
        expect(
            provider.getUnblockDelay({
                status: 429,
                headers: { "x-ratelimit-reset": String(futureSec) }
            })
        ).toBeGreaterThan(20 / Util.durationSeconds.milli);

        expect(provider.getQuotaKeys("google/gemma:free", 0)).toEqual([
            "openrouter#0",
            "openrouter:free#0",
            "openrouter:google/gemma:free#0"
        ]);
        expect(provider.getQuotaKey({ status: 402 }, "google/gemma:free", 0)).toBe("openrouter#0");
        expect(
            provider.getQuotaKey(
                { status: 429, data: { error: { metadata: { limit_source: "openrouter_free_tier_per_minute" } } } },
                "google/gemma:free",
                0
            )
        ).toBe("openrouter:free#0");
        expect(
            provider.getQuotaKey({ status: 429, data: { error: { message: "Provider overloaded" } } }, "google/gemma:free", 0)
        ).toBe("openrouter:google/gemma:free#0");
    });
});
