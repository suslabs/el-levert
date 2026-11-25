import { describe, expect, test, vi } from "vitest";

import GeminiQuotaUtil from "../../../src/util/ai/GeminiQuotaUtil.js";
import Util from "../../../src/util/Util.js";

const second = 1 / Util.durationSeconds.milli,
    hour = Util.durationSeconds.hour / Util.durationSeconds.milli;

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
        ).toBe(39 * second);
        expect(GeminiQuotaUtil.getRetryDelay(quotaError("x", "1.2s"))).toBe(1.2 * second);
        expect(GeminiQuotaUtil.getRetryDelay({ message: "Please retry in 2.5s.", details: "missing" })).toBe(
            2.5 * second
        );
        expect(GeminiQuotaUtil.getRetryDelay({ message: "no details" })).toBeNull();
        expect(GeminiQuotaUtil.getRetryDelay(undefined)).toBeNull();
    });

    test("waits for the daily reset when the daily quota is used up", () => {
        const minute = quotaError("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "39s"),
            day = quotaError("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "39s");

        expect(GeminiQuotaUtil.isDailyLimit(minute)).toBe(false);
        expect(GeminiQuotaUtil.isDailyLimit(day)).toBe(true);

        expect(GeminiQuotaUtil.getUnblockDelay(minute)).toBe(39 * second);
        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date("2026-11-24T20:00:00Z"));
            expect(GeminiQuotaUtil.getUnblockDelay(day)).toBe(12 * hour);
        } finally {
            vi.useRealTimers();
        }
    });

    test("counts down to midnight Pacific time", () => {
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-11-24T08:00:00Z"))).toBe(24 * hour);
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-11-24T20:00:00Z"))).toBe(12 * hour);
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-03-08T08:00:00Z"))).toBe(23 * hour);
        expect(GeminiQuotaUtil.getTimeToDailyReset(new Date("2026-11-01T07:00:00Z"))).toBe(25 * hour);
    });
});
