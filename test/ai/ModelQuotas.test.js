import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import ModelQuotas from "../../src/ai/ModelQuotas.js";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ModelQuotas", () => {
    test("blocks a model until Google's reset time", () => {
        const quotas = new ModelQuotas(1000, 5000);

        expect(quotas.isLimited("model#0")).toBe(false);
        expect(quotas.limit("model#0", 39000)).toBe(39000);

        expect(quotas.isLimited("model#0")).toBe(true);
        expect(quotas.getTimeLeft("model#0")).toBe(39000);
        expect(quotas.isLimited("model#1")).toBe(false);

        vi.advanceTimersByTime(39000);
        expect(quotas.isLimited("model#0")).toBe(false);
    });

    test("backs off exponentially when Google gives no reset time", () => {
        const quotas = new ModelQuotas(1000, 5000);

        expect(quotas.limit("model")).toBe(1000);
        expect(quotas.limit("model")).toBe(2000);
        expect(quotas.limit("model")).toBe(4000);
        expect(quotas.limit("model")).toBe(5000);

        quotas.reset("model");
        expect(quotas.limit("model")).toBe(1000);
    });
});
