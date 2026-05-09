import { RESTJSONErrorCodes } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let MessageHandler;
let MessageLimitTypes;
let getEmoji;

function createHandler() {
    const handler = Object.create(MessageHandler.prototype);

    handler._outCharLimit = 5;
    handler._outLineLimit = 2;
    handler._embedCharLimit = 20;
    handler._embedLineLimit = 2;
    handler.useConfigLimits = true;
    handler.getLimits = MessageHandler.prototype.getLimits;

    return handler;
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: false,
        loadVMs: false,
        config: {
            outCharLimit: 50,
            outLineLimit: 2,
            embedCharLimit: 100,
            embedLineLimit: 3
        }
    });

    ({ default: MessageHandler } = await import("../../../src/handlers/discord/MessageHandler.js"));
    ({ default: MessageLimitTypes } = await import("../../../src/handlers/discord/MessageLimitTypes.js"));
    ({ getEmoji } = await import("../../../src/LevertClient.js"));
});

afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("MessageHandler", () => {
    test("escapes pings, formats embeds, and applies trim, file, and error limits", () => {
        const handler = createHandler();

        expect(MessageHandler._escapeMentions("@everyone `@here`")).toBe("\\@everyone `@here`");
        expect(MessageHandler._escapeMentions(null)).toBeNull();
        expect(getEmoji("missing")).toBe("");
        expect(
            MessageHandler._formatOutput({
                content: "  trimmed  "
            }).content
        ).toBe("trimmed");

        const out = handler._getOutput(
            {
                content: "@here hello world",
                embeds: [
                    {
                        title: "@everyone",
                        description: "line one\nline two\nline three",
                        footer: {
                            text: "@here"
                        },
                        author: {
                            name: "@everyone"
                        },
                        fields: [
                            {
                                name: "@everyone",
                                value: "@here"
                            }
                        ]
                    }
                ]
            },
            {
                limitType: MessageLimitTypes.trim
            }
        );

        expect(out.content).toContain("\\@here");
        expect(out.embeds[0].title).toContain("\\@everyone");
        expect(out.embeds[0].footer.text).toContain("\\@here");

        const fileOut = handler._getOutput(
            {
                content: "1234567890"
            },
            {
                limitType: MessageLimitTypes.file
            }
        );

        expect(fileOut.files).toHaveLength(1);

        expect(
            handler._applyLimits(
                {
                    content: "a\nb\nc"
                },
                {
                    limitType: MessageLimitTypes.error
                }
            )
        ).toEqual({
            content: ":warning: Content has too many newlines. (3 / 2)"
        });

        expect(
            handler._applyLimits(
                {
                    content: "ok",
                    embeds: [
                        {
                            description: "123456789012345678901234567890"
                        }
                    ]
                },
                {
                    limitType: MessageLimitTypes.error
                }
            )
        ).toEqual({
            content: ":warning: Embed is too long. (30 / 20)"
        });

        expect(handler.getLimits(true, true)).toMatchObject({
            outTrim: [5, 2],
            embedTrim: [20, 2]
        });

        expect(
            handler._applyLimits(
                {
                    content: "plain"
                },
                {
                    limitType: MessageLimitTypes.none
                }
            )
        ).toEqual({
            content: "plain"
        });
    });


    test("routes replies across reply and send helpers while tracking arrays", async () => {
        const handler = createHandler();
        handler.hasReplyTracker = true;
        handler.replyTracker = {
            addReply: vi.fn()
        };
        handler._reply = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

        const msg = {
            reply: vi.fn(),
            channel: {
                send: vi.fn()
            }
        };

        await handler.reply(msg, ["one", "two"]);

        expect(handler._reply).toHaveBeenNthCalledWith(
            1,
            msg,
            expect.any(Function),
            {
                content: "one"
            },
            0
        );
        expect(handler._reply).toHaveBeenNthCalledWith(
            2,
            msg,
            expect.any(Function),
            {
                content: "two"
            },
            1
        );
        expect(handler.replyTracker.addReply).toHaveBeenCalledWith(msg, ["first", "second"]);

        handler._replyWithExecError = vi.fn().mockResolvedValueOnce("error-one").mockResolvedValueOnce("error-two");
        await handler.replyWithError(msg, [new Error("one"), new Error("two")], ["reply", "send"], ["one", "two"]);

        expect(handler._replyWithExecError).toHaveBeenCalledTimes(2);
    });

    test("loads and unloads trackers and deletes tracked replies", async () => {
        const handler = createHandler();
        handler.hasReplyTracker = true;
        handler.hasUserTracker = true;
        handler.options = {
            userSweepInterval: 10
        };

        handler.load();

        const clearTrackedMsgs = vi.spyOn(handler.replyTracker, "clearTrackedMsgs");
        const clearUsers = vi.spyOn(handler.userTracker, "clearUsers");
        const stopSweepLoop = vi.spyOn(handler.userTracker, "_stopSweepLoop");

        handler.replyTracker.deleteWithCallback = vi.fn().mockResolvedValueOnce(true);
        await expect(
            handler.delete({
                id: "msg-1"
            })
        ).resolves.toBe(true);

        handler.unload();

        expect(clearTrackedMsgs).toHaveBeenCalledTimes(1);
        expect(clearUsers).toHaveBeenCalledTimes(1);
        expect(stopSweepLoop).toHaveBeenCalledTimes(1);

        const untrackedHandler = createHandler();
        untrackedHandler.hasReplyTracker = false;
        expect(
            await untrackedHandler.delete({
                id: "msg-2"
            })
        ).toBe(false);
    });

    test("routes context replies and context errors through reply or edit as needed", async () => {
        const handler = createHandler();
        const msg = {
            id: "msg-1"
        };
        const context = {
            msg,
            processingReplySent: false
        };

        handler.reply = vi.fn().mockResolvedValue("reply");
        handler.editReply = vi.fn().mockResolvedValue("edit");
        handler.replyWithError = vi.fn().mockResolvedValue("reply-error");
        handler.editReplyWithError = vi.fn().mockResolvedValue("edit-error");
        handler.getReply = vi.fn().mockReturnValue(null);

        await expect(handler.contextReply(context, "ok")).resolves.toBe("reply");
        expect(handler.reply).toHaveBeenCalledWith(msg, "ok");

        await expect(handler.contextReplyWithError(context, new Error("boom"), "command", "running")).resolves.toBe(
            "reply-error"
        );
        expect(handler.replyWithError).toHaveBeenCalledWith(msg, expect.any(Error), "command", "running");

        context.processingReplySent = true;
        handler.getReply.mockReturnValue({
            id: "reply-1"
        });

        await expect(handler.contextReply(context, "updated")).resolves.toBe("edit");
        expect(handler.editReply).toHaveBeenCalledWith(msg, "updated");

        await expect(handler.contextReplyWithError(context, new Error("boom"), "command", "running")).resolves.toBe(
            "edit-error"
        );
        expect(handler.editReplyWithError).toHaveBeenCalledWith(msg, expect.any(Error), "command", "running");
    });

    test("wraps reply failures into error attachments and handles empty-message branches", async () => {
        const handler = createHandler();
        handler.hasReplyTracker = false;

        expect(await handler._reply({}, null, "text", null)).toBeNull();

        const emptyReply = vi.fn().mockResolvedValueOnce("empty");
        await expect(handler._reply({}, emptyReply, "", null)).resolves.toBe("empty");

        const emptyObjectReply = vi.fn().mockResolvedValueOnce("empty-object");
        await expect(
            handler._reply(
                {},
                emptyObjectReply,
                {
                    content: ""
                },
                null
            )
        ).resolves.toBe("empty-object");

        const replyFunc = vi
            .fn()
            .mockRejectedValueOnce({
                code: RESTJSONErrorCodes.CannotSendAnEmptyMessage
            })
            .mockResolvedValueOnce("fallback");

        await expect(handler._reply({}, replyFunc, "payload", null)).resolves.toBe("fallback");

        const directReply = vi.fn().mockResolvedValueOnce("direct-reply");
        await expect(handler._reply({}, directReply, "  payload  ", null)).resolves.toBe("direct-reply");
        expect(directReply).toHaveBeenCalledWith("  payload  ");

        const directEdit = vi.fn().mockResolvedValueOnce("direct-edit");
        await expect(handler._edit({}, directEdit, "  payload  ", null)).resolves.toBe("direct-edit");
        expect(directEdit).toHaveBeenCalledWith("  payload  ");

        const loggerSpy = vi.spyOn(runtime.client.logger, "error");
        const errorReply = vi.fn().mockResolvedValue("sent");
        const result = await handler._replyWithExecError(new Error("boom"), errorReply, "reply", "sending reply");
        expect(result).toBe("sent");
        expect(loggerSpy).toHaveBeenCalled();

        handler._replyWithExecError = vi.fn().mockResolvedValueOnce("reported");
        const genericReply = vi.fn().mockRejectedValueOnce(new Error("explode"));
        await expect(handler._reply({}, genericReply, "payload", null)).resolves.toBe("reported");

        const directHandler = createHandler();
        expect(await directHandler._replyWithExecError(new Error("boom"), null, "reply", "sending reply")).toBeNull();

        const failingErrorReply = vi.fn().mockRejectedValueOnce(new Error("report failed"));
        await expect(
            directHandler._replyWithExecError(new Error("boom"), failingErrorReply, "reply", "sending reply")
        ).resolves.toBeNull();
        expect(loggerSpy).toHaveBeenCalled();
    });
});
