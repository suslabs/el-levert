import { describe, expect, test } from "vitest";

import GeminiQuotaUtil from "../../../src/util/ai/GeminiQuotaUtil.js";

const quotaError = (quotaId, retryDelay) => ({
    details: [
        {
            "@type": "type.googleapis.com/google.rpc.QuotaFailure",
            violations: [{ quotaId, quotaValue: "20" }]
        },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay }
    ]
});

describe("GeminiQuotaUtil", () => {
    test("reads the retry delay Google sends", () => {
        expect(
            GeminiQuotaUtil.getRetryDelay(quotaError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s"))
        ).toBe(39000);
        expect(GeminiQuotaUtil.getRetryDelay(quotaError("x", "1.2s"))).toBe(1200);
        expect(GeminiQuotaUtil.getRetryDelay({ message: "no details" })).toBeNull();
        expect(GeminiQuotaUtil.getRetryDelay(undefined)).toBeNull();
    });

    test("waits for the daily reset when the daily quota is used up", () => {
        const minute = quotaError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s"),
            day = quotaError("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "39s");

        expect(GeminiQuotaUtil.isDailyLimit(minute)).toBe(false);
        expect(GeminiQuotaUtil.isDailyLimit(day)).toBe(true);

        expect(GeminiQuotaUtil.getUnblockDelay(minute)).toBe(39000);
        expect(GeminiQuotaUtil.getUnblockDelay(day)).toBe(GeminiQuotaUtil.getTimeToDailyReset());
    });

    test("counts down to midnight Pacific time", () => {
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-11-24T08:00:00Z"))).toBe(24 * 3600 * 1000);
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-11-24T20:00:00Z"))).toBe(12 * 3600 * 1000);
    });
});
