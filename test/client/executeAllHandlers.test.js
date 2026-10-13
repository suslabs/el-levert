import { describe, expect, test, vi } from "vitest";

import executeAllHandlers from "../../src/client/executeAllHandlers.js";

describe("executeAllHandlers", () => {
    test("clears in-process message ids when a handler throws", async () => {
        const msg = { id: "message" };
        const client = {
            handlerList: [
                {
                    handlesMessages: true,
                    execute: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true)
                }
            ]
        };

        await expect(executeAllHandlers(client, "execute", msg)).rejects.toThrow("boom");
        await executeAllHandlers(client, "execute", msg);

        expect(client.handlerList[0].execute).toHaveBeenCalledTimes(2);
    });

    test("returns early for re-entrant calls and stops once a handler succeeds", async () => {
        const msg = { id: "message" };
        const secondHandler = {
            execute: vi.fn()
        };
        const client = {
            handlerList: [
                {
                    handlesMessages: true,
                    execute: vi.fn(async currentMsg => {
                        expect(await executeAllHandlers(client, "execute", currentMsg)).toBeUndefined();
                        return true;
                    })
                },
                secondHandler
            ]
        };

        await executeAllHandlers(client, "execute", msg);

        expect(client.handlerList[0].execute).toHaveBeenCalledTimes(1);
        expect(secondHandler.execute).not.toHaveBeenCalled();
    });

    test("skips handlers that do not handle messages", async () => {
        const msg = { id: "message" };

        const nonMessageHandler = {
            handlesMessages: false,
            execute: vi.fn()
        };
        const messageHandler = {
            handlesMessages: true,
            execute: vi.fn().mockResolvedValue(true)
        };

        const client = {
            handlerList: [nonMessageHandler, messageHandler]
        };

        await executeAllHandlers(client, "execute", msg);

        expect(nonMessageHandler.execute).not.toHaveBeenCalled();
        expect(messageHandler.execute).toHaveBeenCalledTimes(1);
    });
});
