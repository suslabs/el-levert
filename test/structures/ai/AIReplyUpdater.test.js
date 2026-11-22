import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AIReplyUpdater from "../../../src/structures/ai/AIReplyUpdater.js";

function createContext() {
    const sent = [];

    return {
        sent,
        deferReply: async () => sent.push(["defer"]),
        reply: async data => (sent.push(["reply", data]), "msg")
    };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("AIReplyUpdater", () => {
    test("defers, then coalesces rapid updates into one reply with the latest payload", async () => {
        const ctx = createContext(),
            updater = new AIReplyUpdater(ctx);

        await updater.start("start");

        updater.update("a");
        updater.update("b");

        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval - 1);
        expect(ctx.sent).toEqual([["defer"], ["reply", "start"]]);

        await vi.advanceTimersByTimeAsync(1);
        expect(ctx.sent).toEqual([["defer"], ["reply", "start"], ["reply", "b"]]);
    });

    test("finish drops pending updates and returns the final message", async () => {
        const ctx = createContext(),
            updater = new AIReplyUpdater(ctx);

        await updater.start("start");
        updater.update("a");

        await expect(updater.finish("done")).resolves.toBe("msg");
        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval * 2);

        expect(ctx.sent).toEqual([["defer"], ["reply", "start"], ["reply", "done"]]);
    });
});
