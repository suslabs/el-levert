import { describe, expect, test, vi } from "vitest";

import MessageProcessor from "../../src/client/MessageProcessor.js";

describe("MessageProcessor", () => {
    test("skips non-bridge bot messages", async () => {
        const executeAllHandlers = vi.fn();
        const processor = new MessageProcessor({
            isBridgeBot: vi.fn(() => false),
            _executeAllHandlers: executeAllHandlers
        });

        const msg = { author: { id: "bot-1", bot: true } };

        expect(processor.shouldProcess(msg)).toBe(false);

        await processor.processCreate(msg);
        expect(executeAllHandlers).not.toHaveBeenCalled();
    });

    test("routes create, delete, and edit events through the configured handler executor", async () => {
        const executeAllHandlers = vi.fn();
        const processor = new MessageProcessor({
            isBridgeBot: vi.fn(id => id === "bridge-bot"),
            _executeAllHandlers: executeAllHandlers
        });

        const bridgeMsg = { author: { id: "bridge-bot", bot: true } };
        const userMsg = { author: { id: "user-1", bot: false } };

        expect(processor.shouldProcess(bridgeMsg)).toBe(true);
        expect(processor.shouldProcess(userMsg)).toBe(true);

        await processor.processCreate(bridgeMsg);
        await processor.processDelete(userMsg);
        await processor.processEdit(userMsg);

        expect(executeAllHandlers).toHaveBeenNthCalledWith(1, "execute", bridgeMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(2, "delete", userMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(3, "resubmit", userMsg);
    });
});
