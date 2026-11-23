import { describe, expect, test, vi } from "vitest";

import "../../../../src/LevertClient.js";
import InteractionTracker from "../../../../src/handlers/discord/tracker/InteractionTracker.js";

import Util from "../../../../src/util/Util.js";

describe("TimedTracker sweep loop", () => {
    test("waits for an active expiration before destroying the tracker", async () => {
        const interval = Util.durationSeconds.milli / Util.durationSeconds.milli;

        let release;
        const pending = new Promise(resolve => {
            release = resolve;
        });

        let notifyStart;
        const started = new Promise(resolve => {
            notifyStart = resolve;
        });

        const destroy = vi.fn(async () => {
            notifyStart();
            await pending;
        });
        const tracker = new InteractionTracker(interval);
        tracker.addSession({ id: "session", timestamp: Date.now() - 10 * interval, timeout: interval, destroy });

        await started;
        await Util.delay(5 * interval);
        expect(destroy).toHaveBeenCalledTimes(1);

        const closing = tracker.destroy();
        release();
        await closing;

        expect(tracker.getSession("session")).toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
    });
});
