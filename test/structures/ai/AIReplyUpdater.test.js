import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AIReplyUpdater from "../../../src/structures/ai/AIReplyUpdater.js";

function createTarget() {
    const sent = [];

    return {
        sent,
        reply: async data => (sent.push(["reply", data]), "msg"),
        edit: async data => (sent.push(["edit", data]), "msg")
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("AIReplyUpdater", () => {
    test("coalesces rapid updates into one edit with the latest payload", async () => {
        const target = createTarget(),
            updater = new AIReplyUpdater(target);

        await updater.start("start");

        updater.update("a");
        updater.update("b");

        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval - 1);
        expect(target.sent).toEqual([["reply", "start"]]);

        await vi.advanceTimersByTimeAsync(1);
        expect(target.sent).toEqual([
            ["reply", "start"],
            ["edit", "b"]
        ]);
    });

    test("finish drops pending updates and returns the edited message", async () => {
        const target = createTarget(),
            updater = new AIReplyUpdater(target);

        await updater.start("start");
        updater.update("a");

        await expect(updater.finish("done")).resolves.toBe("msg");
        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval * 2);

        expect(target.sent).toEqual([
            ["reply", "start"],
            ["edit", "done"]
        ]);
    });
});
