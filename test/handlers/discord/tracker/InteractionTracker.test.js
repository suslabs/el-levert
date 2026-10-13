import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import "../../../../src/LevertClient.js";
import InteractionTracker from "../../../../src/handlers/discord/tracker/InteractionTracker.js";

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("InteractionTracker", () => {
    test("tracks sessions, supports get/has/add/remove/clear and sweeps expired sessions", async () => {
        const tracker = new InteractionTracker(10);

        expect(tracker.getSession("missing")).toBeNull();
        expect(tracker.hasSession("1")).toBe(false);

        const destroyMock = vi.fn().mockResolvedValue(true);
        const session = {
            id: "1",
            timeout: 10,
            destroy: destroyMock
        };

        expect(tracker.addSession(session)).toBe(true);
        expect(tracker.hasSession("1")).toBe(true);
        expect(tracker.getSession("1")).toBe(session);

        tracker.items.get("1").timestamp = Date.now() - 100;
        await tracker._sweepSessions();

        expect(tracker.hasSession("1")).toBe(false);
        expect(destroyMock).toHaveBeenCalledWith(true);

        tracker.destroy();
    });
});
