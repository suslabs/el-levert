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
        const userMsg = {
            author: { id: "user-1", bot: false },
            content: "new command",
            createdTimestamp: Date.now(),
            editedTimestamp: Date.now()
        };
        const oldMsg = {
            content: "old command"
        };

        expect(dispatcher.shouldProcess(bridgeMsg)).toBe(true);
        expect(dispatcher.shouldProcess(userMsg)).toBe(true);

        await dispatcher.processCreate(bridgeMsg);
        await dispatcher.processDelete(userMsg);
        await dispatcher.processEdit(oldMsg, userMsg);

        expect(executeAllHandlers).toHaveBeenNthCalledWith(1, "execute", bridgeMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(2, "delete", userMsg);
        expect(executeAllHandlers).toHaveBeenNthCalledWith(3, "resubmit", userMsg);
    });

    test("guards against ghost/partial message edits via shouldProcessEdit", async () => {
        const executeAllHandlers = vi.fn();
        const dispatcher = new MessageDispatcher({
            isBridgeBot: vi.fn(() => false),
            _executeAllHandlers: executeAllHandlers
        });

        const now = Date.now();

        // 1. Missing or null editedTimestamp
        expect(dispatcher.shouldProcessEdit({ content: "old" }, { editedTimestamp: null })).toBe(false);
        expect(dispatcher.shouldProcessEdit({ content: "old" }, { content: "new", createdTimestamp: now })).toBe(false);

        // 2. Message created more than maxEditAge (2 minutes) ago
        expect(
            dispatcher.shouldProcessEdit(
                { content: "old" },
                {
                    content: "new",
                    createdTimestamp: now - MessageDispatcher.maxEditAge - 1000,
                    editedTimestamp: now
                }
            )
        ).toBe(false);

        // 3. Edit occurred more than maxEditDelay (10 seconds) ago
        expect(
            dispatcher.shouldProcessEdit(
                { content: "old" },
                {
                    content: "new",
                    createdTimestamp: now,
                    editedTimestamp: now - MessageDispatcher.maxEditDelay - 1000
                }
            )
        ).toBe(false);

        // 4. Cached old message with identical content
        expect(
            dispatcher.shouldProcessEdit(
                { content: "same", partial: false },
                {
                    content: "same",
                    createdTimestamp: now,
                    editedTimestamp: now
                }
            )
        ).toBe(false);

        // 5. Uncached (partial) old message allows processing even with identical content
        expect(
            dispatcher.shouldProcessEdit(
                { content: "same", partial: true },
                {
                    content: "same",
                    createdTimestamp: now,
                    editedTimestamp: now
                }
            )
        ).toBe(true);

        // 6. Valid fresh edit with changed content
        expect(
            dispatcher.shouldProcessEdit(
                { content: "old", partial: false },
                {
                    content: "new",
                    createdTimestamp: now,
                    editedTimestamp: now
                }
            )
        ).toBe(true);
    });

    test("handles partial newMsg fetch resolution and rejection in processEdit", async () => {
        const executeAllHandlers = vi.fn();
        const dispatcher = new MessageDispatcher({
            isBridgeBot: vi.fn(() => false),
            _executeAllHandlers: executeAllHandlers
        });

        const now = Date.now();

        // Fetch throws (e.g. message deleted before fetch completes)
        const deletedPartialMsg = {
            partial: true,
            fetch: vi.fn().mockRejectedValue(new Error("Unknown Message"))
        };
        await dispatcher.processEdit(null, deletedPartialMsg);
        expect(executeAllHandlers).not.toHaveBeenCalled();

        // Fetch succeeds and message passes guards
        const successfulFetchedMsg = {
            author: { id: "user-1", bot: false },
            content: "fetched new",
            createdTimestamp: now,
            editedTimestamp: now,
            partial: false
        };
        const validPartialMsg = {
            partial: true,
            fetch: vi.fn().mockResolvedValue(successfulFetchedMsg)
        };
        await dispatcher.processEdit({ content: "old" }, validPartialMsg);
        expect(executeAllHandlers).toHaveBeenCalledWith("resubmit", successfulFetchedMsg);
    });
});
