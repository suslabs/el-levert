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
        expect(ctx.isAuthor).toBe(true);
        expect(ctx.ephemeral).toBe(false);
        expect(ctx.replied).toBe(false);
        expect(ctx.updated).toBe(false);
    });

    test("sets properties from data", () => {
        const mockUser = { id: "u-1" },
            mockInteraction = { user: mockUser, channel: {}, guild: {}, message: {}, customId: "btn-1" },
            ctx = new InteractionContext({
                interaction: mockInteraction,
                action: "click",
                ephemeral: true
            });

        expect(ctx.interaction).toBe(mockInteraction);
        expect(ctx.user).toBe(mockUser);
        expect(ctx.author).toBe(mockUser);
        expect(ctx.customId).toBe("btn-1");
        expect(ctx.action).toBe("click");
        expect(ctx.ephemeral).toBe(true);
    });

    test("clone creates a copy with preserved state and overrides", () => {
        const ctx = new InteractionContext({
            action: "initial"
        });
        ctx.replied = true;
        ctx.updated = true;

        const cloned = ctx.clone({ action: "updated" });

        expect(cloned).toBeInstanceOf(InteractionContext);
        expect(cloned.action).toBe("updated");
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
