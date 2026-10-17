import { describe, expect, test, vi } from "vitest";

import RateLimiter from "../../../src/util/misc/RateLimiter.js";

describe("RateLimiter", () => {
    test("allows requests up to maxRequests within the window and rejects subsequent requests", () => {
        const limiter = new RateLimiter(3, 1000);

        expect(limiter.remaining).toBe(3);
        expect(limiter.canRequest(100)).toBe(true);

        expect(limiter.check(100)).toBe(true);
        expect(limiter.check(200)).toBe(true);
        expect(limiter.check(300)).toBe(true);
        expect(limiter.getRemaining(300)).toBe(0);
        expect(limiter.canRequest(400)).toBe(false);
        expect(limiter.check(400)).toBe(false);
    });

    test("remaining and count getters reflect real-time usage", () => {
        const limiter = new RateLimiter(3, 1000);

        expect(limiter.remaining).toBe(3);
        expect(limiter.count).toBe(0);

        limiter.check();
        expect(limiter.remaining).toBe(2);
        expect(limiter.count).toBe(1);

        limiter.check();
        expect(limiter.remaining).toBe(1);
        expect(limiter.count).toBe(2);
    });

    test("slides window and restores capacity as timestamps expire", () => {
        const limiter = new RateLimiter(2, 1000);

        expect(limiter.check(100)).toBe(true);
        expect(limiter.check(500)).toBe(true);
        expect(limiter.check(600)).toBe(false);

        // At time 1101, the timestamp at 100 has expired (1101 - 1000 = 101 > 100)
        expect(limiter.canRequest(1101)).toBe(true);
        expect(limiter.check(1101)).toBe(true);

        // Now we have 500 and 1101 active, so at 1200 it should reject
        expect(limiter.check(1200)).toBe(false);

        // At 1501, 500 has expired too
        expect(limiter.check(1501)).toBe(true);
    });

    test("reset clears all recorded timestamps or key-specific timestamps", () => {
        const limiter = new RateLimiter(1, 5000);

        expect(limiter.check(100)).toBe(true);
        expect(limiter.check(200)).toBe(false);

        limiter.reset();

        expect(limiter.remaining).toBe(1);
        expect(limiter.count).toBe(0);
        expect(limiter.check(300)).toBe(true);
    });

    test("defaults to Infinity maxRequests and 1000ms window", () => {
        const limiter = new RateLimiter();

        expect(limiter.maxRequests).toBe(Infinity);
        expect(limiter.window).toBe(1000);

        for (let i = 0; i < 50; i++) {
            expect(limiter.check()).toBe(true);
        }
    });

    test("supports construction with options object and static from", () => {
        const limiter = new RateLimiter({ maxRequests: 5, window: 2000 });

        expect(limiter.maxRequests).toBe(5);
        expect(limiter.window).toBe(2000);

        const fromInstance = RateLimiter.from(limiter);
        expect(fromInstance).toBe(limiter);

        const fromData = RateLimiter.from({ maxRequests: 10, window: 500 });
        expect(fromData.maxRequests).toBe(10);
        expect(fromData.window).toBe(500);

        expect(RateLimiter.from(null, true)).toBeNull();
    });

    test("tracks multiple independent keys and object identifiers", () => {
        const limiter = new RateLimiter(2, 1000);

        const userA = { id: "user_a" };
        const userB = { id: "user_b" };

        expect(limiter.check(userA, 100)).toBe(true);
        expect(limiter.check(userA, 200)).toBe(true);
        expect(limiter.check(userA, 300)).toBe(false);

        // userB is independent
        expect(limiter.check(userB, 100)).toBe(true);
        expect(limiter.check(userB, 200)).toBe(true);
        expect(limiter.check(userB, 300)).toBe(false);

        expect(limiter.size).toBe(2);
        expect(limiter.has(userA)).toBe(true);
        expect(limiter.has("nonexistent")).toBe(false);

        expect(limiter.getRemaining(userA, 300)).toBe(0);
        expect(limiter.getCount(userA, 300)).toBe(2);

        // Reset userA only
        expect(limiter.reset(userA)).toBe(true);
        expect(limiter.has(userA)).toBe(false);
        expect(limiter.has(userB)).toBe(true);
        expect(limiter.canRequest(userA, 300)).toBe(true);
    });

    test("calculates time to reset accurately", () => {
        const limiter = new RateLimiter(2, 1000);

        expect(limiter.getTimeToReset("key1", 100)).toBe(0);

        limiter.check("key1", 100);
        expect(limiter.getTimeToReset("key1", 200)).toBe(0);

        limiter.check("key1", 250);
        // Both slots filled; oldest is at 100. Window is 1000 -> expires at 1100.
        // At now = 300, remaining wait is 1100 - 300 = 800.
        expect(limiter.getTimeToReset("key1", 300)).toBe(800);

        // At now = 1101, oldest has expired -> capacity available
        expect(limiter.getTimeToReset("key1", 1101)).toBe(0);
    });

    test("supports findItem, removeItem, and clear", () => {
        const limiter = new RateLimiter(5, 1000);

        limiter.check("item1", 100);
        expect(limiter.findItem("item1")).toEqual([100]);
        expect(limiter.findItem("item2")).toBeNull();

        const removed = limiter.removeItem("item1");
        expect(removed).toEqual([100]);
        expect(limiter.hasItem("item1")).toBe(false);
        expect(limiter.removeItem("nonexistent")).toBeNull();

        limiter.check("a", 100);
        limiter.check("b", 100);
        expect(limiter.size).toBe(2);

        limiter.clear();
        expect(limiter.size).toBe(0);
    });

    test("wrap and execute enforce limits", () => {
        const limiter = new RateLimiter(1, 1000);

        let calls = 0;
        const fn = () => ++calls;

        expect(limiter.execute("test", fn)).toBe(1);
        expect(limiter.execute("test", fn)).toBe(false);
        expect(calls).toBe(1);

        const wrapped = limiter.wrap("wrapped", (x, y) => x + y);
        expect(wrapped(2, 3)).toBe(5);
        expect(wrapped(4, 5)).toBeNull();
    });

    test("prunes expired entries and cleans up empty buckets", () => {
        const limiter = new RateLimiter(5, 1000);

        limiter.check("key1", 100);
        limiter.check("key2", 200);
        expect(limiter.size).toBe(2);

        // Pruning at 1150 will expire key1 (1150 - 1000 = 150 > 100), but keep key2 (200 > 150)
        limiter.prune(1150);
        expect(limiter.has("key1")).toBe(false);
        expect(limiter.has("key2")).toBe(true);

        // Pruning at 1300 will expire key2
        limiter.prune(1300);
        expect(limiter.size).toBe(0);
    });

    test("periodic sweep interval cleans up items and destroy clears timer", () => {
        vi.useFakeTimers();

        const limiter = new RateLimiter(5, 1000, { sweepInterval: 500 });

        limiter.check("key1", Date.now());
        expect(limiter.size).toBe(1);

        vi.advanceTimersByTime(1100);
        expect(limiter.size).toBe(0);

        limiter.destroy();
        expect(limiter._sweepTimer).toBeNull();

        vi.useRealTimers();
    });
});
