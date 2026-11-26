import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import QuotaLimiter from "../../../src/util/misc/QuotaLimiter.js";

import Util from "../../../src/util/Util.js";

const second = 1 / Util.durationSeconds.milli;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("QuotaLimiter", () => {
    test("supports default configuration, options objects, and static from", () => {
        const defaults = new QuotaLimiter();
        expect(defaults.fallbackDelay).toBe(second);
        expect(defaults.maxFallbackDelay).toBe(Util.durationSeconds.minute / Util.durationSeconds.milli);
        expect(defaults.sweepInterval).toBe(0);

        const configured = new QuotaLimiter({ fallbackDelay: 250, maxFallbackDelay: 2000 });
        expect(configured.fallbackDelay).toBe(250);
        expect(configured.maxFallbackDelay).toBe(2000);

        expect(QuotaLimiter.from(configured)).toBe(configured);
        expect(QuotaLimiter.from({ fallbackDelay: 500 }).fallbackDelay).toBe(500);
        expect(QuotaLimiter.from(null, true)).toBeNull();
    });

    test("tracks active cooldowns, remaining time, and metadata per key", () => {
        const limiter = new QuotaLimiter(second, 5 * second);

        expect(limiter.canRequest("k1")).toBe(true);
        expect(limiter.isLimited("k1")).toBe(false);
        expect(limiter.getTimeToReset("k1")).toBe(0);

        const target = { id: "k1" };
        expect(limiter.limit(target, 10 * second, { reason: "quota" })).toBe(10 * second);

        expect(limiter.size).toBe(1);
        expect(limiter.has("k1")).toBe(true);
        expect(limiter.isLimited("k1")).toBe(true);
        expect(limiter.canRequest("k1")).toBe(false);
        expect(limiter.getActive("k1")).toMatchObject({ reason: "quota", hits: 1, until: Date.now() + 10 * second });

        vi.advanceTimersByTime(4 * second);
        expect(limiter.getTimeToReset("k1")).toBe(6 * second);
        expect(limiter.limit("k1", 3 * second)).toBe(6 * second);
        expect(limiter.limit("k1", 15 * second)).toBe(15 * second);

        vi.advanceTimersByTime(15 * second);
        expect(limiter.isLimited("k1")).toBe(false);
        expect(limiter.canRequest("k1")).toBe(true);
    });

    test("applies exponential backoff with optional cap and supports unbounded -1 cap", () => {
        const capped = new QuotaLimiter(second, 5 * second);

        for (const delay of [second, 2 * second, 4 * second, 5 * second]) {
            expect(capped.limit("k")).toBe(delay);
            vi.advanceTimersByTime(delay);
        }

        const uncapped = new QuotaLimiter(second, -1);

        for (const delay of [second, 2 * second, 4 * second, 8 * second, 16 * second]) {
            expect(uncapped.limit("k")).toBe(delay);
            vi.advanceTimersByTime(delay);
        }

        const disabled = new QuotaLimiter(0, 0);
        expect(disabled.limit("k")).toBe(0);
        expect(disabled.has("k")).toBe(false);
        expect(disabled.limit("k", 3 * second)).toBe(3 * second);
    });

    test("allows one recovery probe at a time and resets only on explicit recovery", () => {
        const limiter = new QuotaLimiter(second, 10 * second);

        const unrestricted = limiter.acquire("fresh");
        expect(typeof unrestricted).toBe("function");
        unrestricted(false);

        limiter.limit("key");
        expect(limiter.acquire("key")).toBeNull();

        vi.advanceTimersByTime(second);
        const probe = limiter.acquire("key");
        expect(typeof probe).toBe("function");
        expect(limiter.canRequest("key")).toBe(false);
        expect(limiter.acquire("key")).toBeNull();

        probe(false);
        probe(true);
        expect(limiter.limit("key")).toBe(2 * second);

        vi.advanceTimersByTime(2 * second);
        const recovery = limiter.acquire("key");
        recovery(true);

        expect(limiter.has("key")).toBe(false);
        expect(limiter.limit("key")).toBe(second);
    });

    test("execute and wrap enforce cooldowns for sync and async callbacks", async () => {
        const limiter = new QuotaLimiter(second, 5 * second);
        expect(() => limiter.execute("k", "not-a-fn")).toThrow("Function must be provided to execute");
        expect(() => limiter.wrap("k", "not-a-fn")).toThrow("Function must be provided to wrap");

        expect(limiter.execute("k", () => "ok")).toBe("ok");

        limiter.limit("k", 2 * second);
        expect(limiter.execute("k", () => "blocked")).toBe(false);

        const wrapped = limiter.wrap("k", async val => val * 2);
        expect(wrapped(5)).toBeNull();

        vi.advanceTimersByTime(2 * second);
        await expect(wrapped(5)).resolves.toBe(10);
        expect(limiter.has("k")).toBe(false);

        limiter.limit("k", 2 * second);
        vi.advanceTimersByTime(2 * second);
        await expect(
            limiter.execute("k", async () => {
                throw new Error("still down");
            })
        ).rejects.toThrow("still down");
        expect(limiter.limit("k")).toBe(2 * second);
        vi.advanceTimersByTime(2 * second);
        expect(limiter.limit("k")).toBe(4 * second);
    });

    test("supports prune, reset, removeItem, clear, and periodic sweep cleanup", () => {
        const limiter = new QuotaLimiter({
            fallbackDelay: second,
            maxFallbackDelay: 2 * second,
            sweepInterval: second
        });

        limiter.limit("a", second);
        limiter.limit("b", 10 * second);

        vi.advanceTimersByTime(second);
        limiter.prune("a");
        expect(limiter.has("a")).toBe(false);
        expect(limiter.has("b")).toBe(true);

        expect(limiter.removeItem("b")).toMatchObject({ hits: 1 });
        expect(limiter.removeItem("missing")).toBeNull();

        limiter.limit("c", second);
        expect(limiter.reset("c")).toBe(true);
        limiter.limit("d", second);
        limiter.reset();
        expect(limiter.size).toBe(0);

        limiter.limit("swept", second);
        vi.advanceTimersByTime(4 * second);
        expect(limiter.has("swept")).toBe(false);

        limiter.limit("account", 2 * second);
        limiter.limit("model", 5 * second);
        expect(limiter.getStrictestActive(["account", "model"])).toMatchObject({ until: Date.now() + 5 * second });
        expect(limiter.acquireAll(["account", "model"])).toBeNull();

        vi.advanceTimersByTime(2 * second);
        expect(limiter.acquireAll(["account", "model"])).toBeNull();
        expect(limiter.findItem("account").probing).toBe(false);

        vi.advanceTimersByTime(3 * second);
        const releaseAll = limiter.acquireAll(["account", "model"]);
        expect(typeof releaseAll).toBe("function");
        releaseAll(true);
        expect(limiter.has("account")).toBe(false);
        expect(limiter.has("model")).toBe(false);

        limiter.destroy();
    });
});
