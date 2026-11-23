import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import ComponentSession from "../../../src/structures/interaction/ComponentSession.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let handler;
let MessageHandler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadHandlers: true,
        loadVMs: false
    });

    handler = runtime.client.interactionHandler;
    ({ default: MessageHandler } = await import("../../../src/handlers/discord/MessageHandler.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("InteractionHandler", () => {
    test("runs the synchronous parent unload and stops its tracker", async () => {
        const parentUnload = vi.spyOn(MessageHandler.prototype, "unload");

        await handler.unload();

        expect(parentUnload).toHaveBeenCalledOnce();
        expect(handler.tracker._sweepLoop.running).toBe(false);
        parentUnload.mockRestore();
    });

    test("ignores non-component interactions", async () => {
        const interaction = {
            isMessageComponent: () => false,
            isModalSubmit: () => false
        };

        const result = await handler.execute(interaction);
        expect(result).toBe(false);
    });

    test("handles expired or missing sessions with an ephemeral warning", async () => {
        const replyMock = vi.fn().mockResolvedValue(true);
        const interaction = {
            isMessageComponent: () => true,
            isModalSubmit: () => false,
            customId: "page:next:expired123",
            user: { id: "user-1" },
            replied: false,
            deferred: false,
            reply: replyMock
        };

        const result = await handler.execute(interaction);

        expect(result).toBe(false);
        expect(replyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                ephemeral: true
            })
        );
    });

    test("dispatches to registered active session", async () => {
        const mockCtx = {
            author: { id: "user-1" },
            getReply: () => null,
            clone: overrides => ({
                ...mockCtx,
                ...overrides
            })
        };

        const session = new ComponentSession(mockCtx, { timeout: 0 });
        handler.registerSession(session);

        const handleSpy = vi.spyOn(session, "handleInteraction").mockResolvedValue(true);

        const interaction = {
            isMessageComponent: () => true,
            isModalSubmit: () => false,
            customId: `page:next:${session.id}`,
            user: { id: "user-1" }
        };

        const result = await handler.execute(interaction);

        expect(result).toBe(true);
        expect(handleSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction
            })
        );
    });

    test("dispatches modal submit interactions to registered session", async () => {
        const mockCtx = {
            author: { id: "user-1" },
            getReply: () => null,
            clone: overrides => ({
                ...mockCtx,
                ...overrides
            })
        };

        const session = new ComponentSession(mockCtx, { timeout: 0 });
        handler.registerSession(session);

        const handleSpy = vi.spyOn(session, "handleInteraction").mockResolvedValue(true);

        const interaction = {
            isMessageComponent: () => false,
            isModalSubmit: () => true,
            customId: `page:modal:${session.id}`,
            user: { id: "user-1" }
        };

        const result = await handler.execute(interaction);

        expect(result).toBe(true);
        expect(handleSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction
            })
        );
    });
});
