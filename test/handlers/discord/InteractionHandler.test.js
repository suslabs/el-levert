import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import ComponentSession from "../../../src/structures/interaction/ComponentSession.js";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let handler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadHandlers: true,
        loadVMs: false
    });

    handler = runtime.client.interactionHandler;
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("InteractionHandler", () => {
    test("ignores non-component interactions", async () => {
        const interaction = {
            isMessageComponent: () => false
        };

        const result = await handler.execute(interaction);
        expect(result).toBe(false);
    });

    test("handles expired or missing sessions with an ephemeral warning", async () => {
        const replyMock = vi.fn().mockResolvedValue(true);
        const interaction = {
            isMessageComponent: () => true,
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
            getReply: () => null
        };

        const session = new ComponentSession(mockCtx, { timeout: 0 });
        handler.registerSession(session);

        const handleSpy = vi.spyOn(session, "handleInteraction").mockResolvedValue(true);

        const interaction = {
            isMessageComponent: () => true,
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
            getReply: () => null
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
