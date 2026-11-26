import { describe, expect, test, vi } from "vitest";

import GeminiProvider from "../../../src/ai/providers/GeminiProvider.js";

import Util from "../../../src/util/Util.js";

const second = 1 / Util.durationSeconds.milli,
    hour = Util.durationSeconds.hour / Util.durationSeconds.milli;

const provider = new GeminiProvider(null, ["key"], { endpoint: "https://gemini.test/v1beta" });

const quotaError = (quotaId, retryDelay) => ({
    details: [
        {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId, quotaValue: "20" }]
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }
    ]
});

describe("GeminiProvider", () => {
    test("builds generate and streaming requests with optional thinking level", () => {
        const body = { contents: [{ role: "user", parts: [{ text: "hi" }] }] };

        const standard = provider.buildRequest("gemini-2.5-flash", "gk-1", body);
        expect(standard.url).toBe("https://gemini.test/v1beta/models/gemini-2.5-flash:generateContent");
        expect(standard.headers["x-goog-api-key"]).toBe("gk-1");
        expect(standard.data).toEqual(body);

        const thinking = provider.buildRequest("gemini-2.5-flash", "gk-1", body, {
            stream: true,
            thinkingLevel: "low"
        });
        expect(thinking.url).toBe("https://gemini.test/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse");
        expect(thinking.data.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
    });

    test("reads the retry delay Google sends", () => {
        expect(
            GeminiProvider.getRetryDelay(quotaError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s"))
        ).toBe(39 * second);
        expect(GeminiProvider.getRetryDelay(quotaError("x", "1.2s"))).toBe(1.2 * second);
        expect(GeminiProvider.getRetryDelay({ message: "Please retry in 2.5s.", details: "missing" })).toBe(
            2.5 * second
        );
        expect(GeminiProvider.getRetryDelay({ message: "no details" })).toBeNull();
        expect(GeminiProvider.getRetryDelay(undefined)).toBeNull();
    });

    test("waits for the daily reset when a 429 hits the daily quota", () => {
        const minute = quotaError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s"),
            day = quotaError("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "39s");

        expect(GeminiProvider.isDailyLimit(minute)).toBe(false);
        expect(GeminiProvider.isDailyLimit(day)).toBe(true);

        expect(provider.getUnblockDelay({ status: 429, data: { error: minute } })).toBe(39 * second);
        expect(provider.getUnblockDelay({ status: 503, data: { error: day } })).toBe(39 * second);
        expect(provider.getUnblockDelay({ status: 503, headers: { "retry-after": "30" } })).toBe(30 * second);

        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
            expect(provider.getUnblockDelay({ status: 429, data: { error: day } })).toBe(12 * hour);
        } finally {
            vi.useRealTimers();
        }
    });

    test("counts down to midnight Pacific time", () => {
        expect(GeminiProvider.getTimeToDailyReset(new Date("2026-11-24T08:00:00Z"))).toBe(24 * hour);
        expect(GeminiProvider.getTimeToDailyReset(new Date("2026-11-24T20:00:00Z"))).toBe(12 * hour);
        expect(GeminiProvider.getTimeToDailyReset(new Date("2026-03-08T08:00:00Z"))).toBe(23 * hour);
        expect(GeminiProvider.getTimeToDailyReset(new Date("2026-11-01T07:00:00Z"))).toBe(25 * hour);

        expect(provider.getQuotaKey({ status: 429, data: { error: quotaError("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "10s") } }, "gemini-2.5-flash", 0)).toBe(
            "gemini:gemini-2.5-flash#0"
        );
        expect(provider.getQuotaKey({ status: 429, data: { error: quotaError("GenerateRequestsPerDayPerProject-FreeTier", "10s") } }, "gemini-2.5-flash", 0)).toBe(
            "gemini#0"
        );
    });
});
