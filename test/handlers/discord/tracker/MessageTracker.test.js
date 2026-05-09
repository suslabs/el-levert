import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../../helpers/runtimeHarness.js";

let runtime;
let ReactionTracker;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false
    });

    ({ default: ReactionTracker } = await import("../../../../src/handlers/discord/tracker/ReactionTracker.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("MessageTracker", () => {
    test("adds, edits, deletes, and clears tracked reaction data", async () => {
        const tracker = new ReactionTracker(2);
        const msg = { id: "1" };

        expect(tracker.getData(msg)).toEqual({ trigger: null, reactions: [] });
        expect(tracker.addReaction(msg, ":)")).toBe(true);
        expect(tracker.getData(msg)).toEqual({ trigger: "1", reactions: [":)"] });

        expect(tracker.editReaction(msg, ":)", ":D")).toBe(":)");
        expect(tracker.getData(msg).reactions).toEqual([":D"]);

        expect(tracker.editReaction(msg, null, [":P", ":O"])).toEqual([":D"]);
        expect(tracker.getData(msg).reactions).toEqual([":P", ":O"]);

        expect(tracker.deleteData(msg)).toBe(true);
        tracker.addReaction(msg, [":P", ":O"]);
        expect(tracker.deleteReaction(msg, ":P")).toBe(":P");
        expect(tracker.deleteReaction(msg)).toEqual([":O"]);
        expect(tracker.deleteData(msg)).toBe(false);
        expect(tracker.clearTrackedMsgs()).toBe(true);
    });

    test("prunes old entries and logs callback failures for tracked lists", async () => {
        const loggerSpy = vi.spyOn(runtime.client.logger, "error");
        const tracker = new ReactionTracker(1);

        tracker.addReaction("1", [":)", ":D"]);
        tracker.addReaction("2", ":P");

        expect(tracker.trackedMsgs.has("1")).toBe(false);

        tracker.addReaction("3", [":X", ":Y"]);
        await expect(
            tracker.deleteWithCallback("3", "reaction", async reaction => {
                if (reaction === ":X") {
                    throw new Error("boom");
                }
            })
        ).resolves.toBe(true);

        expect(loggerSpy).toHaveBeenCalled();
        expect(tracker.deleteReaction("missing")).toBeNull();

        const disabled = new ReactionTracker(0);
        expect(disabled.clearTrackedMsgs()).toBe(false);
        expect(disabled.addReaction("x", ":)")).toBe(false);
    });
});
