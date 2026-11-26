import { describe, expect, test, vi } from "vitest";

import BaseCommandContext from "../../../../src/structures/command/context/BaseCommandContext.js";
import InteractionContext from "../../../../src/structures/command/context/InteractionContext.js";

describe("InteractionContext", () => {
    test("initializes with defaults", () => {
        const ctx = new InteractionContext({});

        expect(ctx).toBeInstanceOf(BaseCommandContext);
        expect(ctx.isInteraction).toBe(true);
        expect(ctx.interaction).toBeNull();
        expect(ctx.handler).toBeNull();
        expect(ctx.session).toBeNull();
        expect(ctx.commandContext).toBeNull();
        expect(ctx.user).toBeNull();
        expect(ctx.author).toBeNull();
        expect(ctx.customId).toBe("");
        expect(ctx.action).toBe("");
        expect(ctx.componentId).toBeNull();
        expect(ctx.isAuthor).toBe(true);
        expect(ctx.ephemeral).toBe(false);
        expect(ctx.replied).toBe(false);
        expect(ctx.updated).toBe(false);
    });

    test("sets properties from data and componentId", () => {
        const mockUser = { id: "u-1" },
            mockInteraction = { user: mockUser, channel: {}, guild: {}, message: {}, customId: "page:next:s1" },
            componentId = { prefix: "page", action: "next", args: [], sessionId: "s1" },
            ctx = new InteractionContext({
                interaction: mockInteraction,
                componentId,
                ephemeral: true
            });

        expect(ctx.interaction).toBe(mockInteraction);
        expect(ctx.user).toBe(mockUser);
        expect(ctx.author).toBe(mockUser);
        expect(ctx.customId).toBe("page:next:s1");
        expect(ctx.action).toBe("next");
        expect(ctx.componentId).toEqual(componentId);
        expect(ctx.ephemeral).toBe(true);
    });

    test("determines authorship from session and propagates ephemeral replies", async () => {
        const handler = { interactionReply: vi.fn(), interactionUpdate: vi.fn() },
            commandContext = { ephemeral: true, markReplied: vi.fn() },
            ctx = new InteractionContext({
                interaction: { user: { id: "visitor" }, customId: "page:next:id" },
                handler,
                session: { authorId: "author", context: commandContext },
                componentId: { prefix: "page", action: "next", args: [], sessionId: "id" }
            });

        expect(ctx.isAuthor).toBe(false);

        await ctx.reply("choice");

        expect(handler.interactionReply).toHaveBeenCalledWith(ctx.interaction, "choice", { ephemeral: true });
        expect(commandContext.markReplied).toHaveBeenCalledOnce();
        expect(ctx.replied).toBe(true);
        expect(ctx.updated).toBe(false);
    });

    test("clone creates a copy with preserved state and overrides", async () => {
        const handler = { interactionReply: vi.fn(), interactionUpdate: vi.fn() },
            ctx = new InteractionContext({
                interaction: { user: { id: "author" } },
                handler,
                action: "initial",
                componentId: { prefix: "page", action: "initial", args: [], sessionId: "id" }
            });

        await ctx.update("next page");
        expect(handler.interactionUpdate).toHaveBeenCalledWith(ctx.interaction, "next page", {});

        const cloned = ctx.clone({ action: "updated" });

        expect(cloned).toBeInstanceOf(InteractionContext);
        expect(cloned.action).toBe("updated");
        expect(cloned.componentId).toEqual(ctx.componentId);
        expect(cloned.replied).toBe(true);
        expect(cloned.updated).toBe(true);
    });

    test("markReplied marks context as replied and propagates to commandContext", () => {
        const mockCmdCtx = { markReplied: vi.fn() },
            ctx = new InteractionContext({
                commandContext: mockCmdCtx
            });

        expect(ctx.replied).toBe(false);
        ctx.markReplied();

        expect(ctx.replied).toBe(true);
        expect(mockCmdCtx.markReplied).toHaveBeenCalledOnce();
    });

    test("markReplied works without commandContext", () => {
        const ctx = new InteractionContext({});

        expect(ctx.replied).toBe(false);
        ctx.markReplied();
        expect(ctx.replied).toBe(true);
    });
});
