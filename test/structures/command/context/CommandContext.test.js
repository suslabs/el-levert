import { describe, expect, test } from "vitest";

import BaseCommandContext from "../../../../src/structures/command/context/BaseCommandContext.js";
import CommandContext from "../../../../src/structures/command/context/CommandContext.js";

describe("BaseCommandContext vs CommandContext separation", () => {
    test("BaseCommandContext does not define Discord-specific fields", () => {
        const baseCtx = new BaseCommandContext({});

        expect(baseCtx.raw).toBe("");
        expect(baseCtx.rawContent).toBeUndefined();
        expect(baseCtx.replyMsg).toBeUndefined();
        expect(baseCtx.isEdit).toBeUndefined();
        expect(baseCtx.processingReplySent).toBeUndefined();
    });

    test("CommandContext initializes Discord-specific fields with defaults", () => {
        const cmdCtx = new CommandContext({});

        expect(cmdCtx.raw).toBe("");
        expect(cmdCtx.rawContent).toBeUndefined();
        expect(cmdCtx.replyMsg).toBeNull();
        expect(cmdCtx.isEdit).toBe(false);
        expect(cmdCtx.processingReplySent).toBe(false);
    });

    test("CommandContext sets Discord-specific fields when provided", () => {
        const mockMsg = { id: "msg-123", content: "referenced" };

        const cmdCtx = new CommandContext({
            replyMsg: mockMsg,
            isEdit: true,
            processingReplySent: true
        });

        expect(cmdCtx.replyMsg).toBe(mockMsg);
        expect(cmdCtx.isEdit).toBe(true);
        expect(cmdCtx.processingReplySent).toBe(true);
    });

    test("CommandContext preserves Discord-specific fields across clone", () => {
        const mockMsg1 = { id: "msg-1" },
            mockMsg2 = { id: "msg-2" };

        const cmdCtx = new CommandContext({
            replyMsg: mockMsg1,
            isEdit: true,
            processingReplySent: true
        });

        const cloned = cmdCtx.clone();
        expect(cloned.replyMsg).toBe(mockMsg1);
        expect(cloned.isEdit).toBe(true);
        expect(cloned.processingReplySent).toBe(true);

        const overridden = cmdCtx.clone({
            replyMsg: mockMsg2,
            isEdit: false,
            processingReplySent: false
        });
        expect(overridden.replyMsg).toBe(mockMsg2);
        expect(overridden.isEdit).toBe(false);
        expect(overridden.processingReplySent).toBe(false);
    });

    test("BaseCommandContext clone works without child clone hook", () => {
        const baseCtx = new BaseCommandContext({
            raw: "test raw",
            argsText: "test args"
        });

        const cloned = baseCtx.clone();
        expect(cloned.raw).toBe("test raw");
        expect(cloned.argsText).toBe("test args");
        expect(cloned.replyMsg).toBeUndefined();
        expect(cloned.isEdit).toBeUndefined();
        expect(cloned.processingReplySent).toBeUndefined();
    });

    test("CommandContext handles getters and filters getter keys from data without throwing", () => {
        const mockMsg = { id: "msg-123", author: { id: "u-1" }, channel: { id: "c-1" } };
        const mockInteraction = { id: "int-123" };
        const mockInteractionCtx = { interaction: mockInteraction, isAuthor: false };

        const ctxWithMsg = new CommandContext({ msg: mockMsg });
        expect(ctxWithMsg.message).toBe(mockMsg);
        expect(ctxWithMsg.msg).toBe(mockMsg);
        expect(ctxWithMsg.author).toBe(mockMsg.author);
        expect(ctxWithMsg.channel).toBe(mockMsg.channel);
        expect(ctxWithMsg.interaction).toBeNull();
        expect(ctxWithMsg.isInteraction).toBe(false);
        expect(ctxWithMsg.isAuthor).toBe(true);

        const ctxWithInteraction = new CommandContext({
            interactionContext: mockInteractionCtx,
            interaction: mockInteraction,
            isAuthor: false
        });
        expect(ctxWithInteraction.isInteraction).toBe(true);
        expect(ctxWithInteraction.interaction).toBe(mockInteraction);
        expect(ctxWithInteraction.isAuthor).toBe(false);

        const cloned = ctxWithMsg.clone({
            interactionContext: mockInteractionCtx,
            interaction: mockInteraction,
            isAuthor: false
        });
        expect(cloned.isInteraction).toBe(true);
        expect(cloned.interaction).toBe(mockInteraction);
        expect(cloned.isAuthor).toBe(false);
    });
});
