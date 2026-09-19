import { describe, expect, test, vi } from "vitest";

import MessageDispatcher from "../../src/client/MessageDispatcher.js";

describe("MessageDispatcher", () => {
    test("skips non-bridge bot messages", async () => {
        const executeAllHandlers = vi.fn();
        const dispatcher = new MessageDispatcher({
            isBridgeBot: vi.fn(() => false),
            _executeAllHandlers: executeAllHandlers
        });

        const msg = { author: { id: "bot-1", bot: true } };

        expect(dispatcher.shouldProcess(msg)).toBe(false);

        await dispatcher.processCreate(msg);
        expect(executeAllHandlers).not.toHaveBeenCalled();
    });

    test("routes create, delete, and edit events through the configured handler executor", async () => {
        const executeAllHandlers = vi.fn();
        const dispatcher = new MessageDispatcher({
            isBridgeBot: vi.fn(id => id === "bridge-bot"),
            _executeAllHandlers: executeAllHandlers
        });

        const bridgeMsg = { author: { id: "bridge-bot", bot: true } };
        const userMsg = { author: { id: "user-1", bot: false } };

        expect(dispatcher.shouldProcess(bridgeMsg)).toBe(true);
        expect(dispatcher.shouldProcess(userMsg)).toBe(true);

        await dispatcher.processCreate(bridgeMsg);
        await dispatcher.processDelete(userMsg);
        await dispatcher.processEdit(userMsg);

        expect(executeAllHandlers).toHaveBeenNthCalledWith(1, "execute", bridgeMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(2, "delete", userMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(3, "resubmit", userMsg);
    });
});
