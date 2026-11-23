import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import AIReplyUpdater from "../../../src/structures/ai/AIReplyUpdater.js";

function createContext() {
    const sent = [];

    return {
        sent,
        isInteraction: false,
        deferReply: async () => sent.push(["defer"]),
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
    test("replies once, then coalesces rapid updates into one edit with the latest payload", async () => {
        const ctx = createContext(),
            updater = new AIReplyUpdater(ctx);

        await updater.start("start");

        updater.update("a");
        updater.update("b");

        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval - 1);
        expect(ctx.sent).toEqual([["defer"], ["reply", "start"]]);

        await vi.advanceTimersByTimeAsync(1);
        expect(ctx.sent).toEqual([["defer"], ["reply", "start"], ["edit", "b"]]);
    });

    test("finish drops pending updates and returns the final message", async () => {
        const ctx = createContext(),
            updater = new AIReplyUpdater(ctx);

        await updater.start("start");
        updater.update("a");

        await expect(updater.finish("done")).resolves.toBe("msg");
        await vi.advanceTimersByTimeAsync(AIReplyUpdater.minInterval * 2);

        expect(ctx.sent).toEqual([["defer"], ["reply", "start"], ["edit", "done"]]);
    });

    test("updates interactions through their deferred reply", async () => {
        const ctx = { ...createContext(), isInteraction: true },
            updater = new AIReplyUpdater(ctx);

        await updater.start("start");
        await updater.finish("done");

        expect(ctx.sent).toEqual([["defer"], ["reply", "start"], ["reply", "done"]]);
    });
});
