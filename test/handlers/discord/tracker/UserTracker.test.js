import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import UserTracker from "../../../../src/handlers/discord/tracker/UserTracker.js";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("UserTracker", () => {
    test("tracks users, guards callbacks, and sweeps stale entries", async () => {
        const tracker = new UserTracker(10);

        expect(tracker.findUser(null)).toBeNull();
        expect(tracker.hasUser("1")).toBe(false);
        expect(tracker.addUser("1")).toBe(true);
        expect(tracker.hasUser({ id: "1" })).toBe(true);
        expect(tracker.removeUser("missing")).toBeNull();

        expect(() => tracker.withUser("1")).toThrow("Callback function required");
        expect(() => tracker.withUser("1", () => {})).toThrow("User already exists");

        expect(tracker.withUser("2", () => "ok")).toBe("ok");
        await expect(tracker.withUser("3", async () => "async")).resolves.toBe("async");
        expect(() =>
            tracker.withUser("4", () => {
                throw new Error("boom");
            })
        ).toThrow("boom");

        tracker.clearUsers();
        tracker.addUser("old");
        tracker.trackedUsers[0].timestamp = Date.now() - 100;
        tracker._sweepUsers();
        expect(tracker.findUser("old")).toBeNull();

        tracker.clearUsers();
        expect(tracker.trackedUsers).toEqual([]);
        tracker._stopSweepLoop();
    });
});
