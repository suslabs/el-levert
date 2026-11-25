import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import ModelQuotas from "../../src/ai/ModelQuotas.js";
import Util from "../../src/util/Util.js";

const second = 1 / Util.durationSeconds.milli;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("ModelQuotas", () => {
    test("blocks a model until Google's reset time", () => {
        const quotas = new ModelQuotas(second, 5 * second);

        expect(quotas.getActive("model#0")).toBeNull();
        expect(quotas.limit("model#0", 39 * second, 429)).toBe(39 * second);

        expect(quotas.getActive("model#0")).toMatchObject({ until: Date.now() + 39 * second, status: 429 });
        expect(quotas.getActive("model#1")).toBeNull();

        vi.advanceTimersByTime(39 * second);
        expect(quotas.getActive("model#0")).toBeNull();
    });

    test("backs off exponentially when Google gives no reset time", () => {
        const quotas = new ModelQuotas(second, 5 * second);

        for (const delay of [second, 2 * second, 4 * second, 5 * second]) {
            expect(quotas.limit("model")).toBe(delay);
            vi.advanceTimersByTime(delay);
        }

        const recover = quotas.acquire("model");
        recover(null);
        expect(quotas.limit("model")).toBe(second);
    });

    test("a concurrent overload cannot cut short an active quota cooldown", () => {
        const quotas = new ModelQuotas(second, 5 * second);

        const release = quotas.acquire("model");
        quotas.limit("model", 39 * second, 429);
        vi.advanceTimersByTime(second);
        release(null);

        expect(quotas.limit("model", null, 503)).toBe(38 * second);
        expect(quotas.getActive("model")).toMatchObject({ hits: 1, status: 429 });
    });

    test("allows one recovery attempt and preserves streaming backoff after a triage success", () => {
        const quotas = new ModelQuotas(second, 5 * second);
        quotas.limit("model", null, 503, true);
        expect(quotas.acquire("model")).toBeNull();

        vi.advanceTimersByTime(second);
        const release = quotas.acquire("model");
        expect(quotas.acquire("model")).toBeNull();

        release(false);

        expect(quotas.limit("model", null, 503, true)).toBe(2 * second);
    });
});
