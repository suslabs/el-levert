import { describe, expect, test, vi } from "vitest";

import ReactionDispatcher from "../../src/client/ReactionDispatcher.js";

describe("ReactionDispatcher", () => {
    test("skips bot reactions", async () => {
        const execute = vi.fn(),
            dispatcher = new ReactionDispatcher({ followUpHandler: { execute } });

        await expect(dispatcher.processAdd({}, { id: "bot-1", bot: true })).resolves.toBe(false);
        expect(execute).not.toHaveBeenCalled();
    });

    test("routes reactions to the follow-up handler", async () => {
        const execute = vi.fn().mockResolvedValue(true),
            dispatcher = new ReactionDispatcher({ followUpHandler: { execute } });

        const reaction = { emoji: { name: "1️⃣" } },
            user = { id: "user-1", bot: false };

        await expect(dispatcher.processAdd(reaction, user)).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith(reaction, user);
    });

    test("ignores reactions when the follow-up handler isn't loaded", async () => {
        const dispatcher = new ReactionDispatcher({});
        await expect(dispatcher.processAdd({}, { id: "user-1", bot: false })).resolves.toBe(false);
    });
});
