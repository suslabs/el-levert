import { RESTJSONErrorCodes } from "discord.js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import DiscordUtil from "../../../src/util/DiscordUtil.js";

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
    test("applies explicit user pings without enabling other mentions", () => {
        const handler = createHandler();

        const out = handler._getOutput(
            { content: "<@123> @everyone", pings: ["123"] },
            { limitType: MessageLimitTypes.none }
        );

        expect(out.content).toBe("<@123> \\@everyone");
        expect(out.allowedMentions).toEqual({ repliedUser: true, parse: [], users: ["123"] });
        expect(out).not.toHaveProperty("pings");

        const plain = handler._getOutput({ content: "<@123>" }, { limitType: MessageLimitTypes.none });
        expect(plain).not.toHaveProperty("allowedMentions");

        runtime.client.setOptions({ mentionUsers: true, pingReply: false });

        const restricted = handler._getOutput(
            { content: "<@123> <@456>", pings: ["123"] },
            { limitType: MessageLimitTypes.none }
        );

        expect(restricted.allowedMentions).toEqual({ repliedUser: false, parse: ["roles"], users: ["123"] });
    });

    test("escapes pings, formats embeds, and applies trim, file, and error limits", () => {
        const handler = createHandler();

        expect(DiscordUtil.escapeMassMentions("@everyone `@here`")).toBe("\\@everyone `@here`");
        expect(DiscordUtil.escapeMassMentions(null)).toBeNull();
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

        expect(
            handler._applyLimits(
                {
                    embeds: [
                        {
                            fields: [{ name: "Title", value: "x".repeat(1025) }]
                        }
                    ]
                },
                {
                    limitType: MessageLimitTypes.error
                }
            )
        ).toEqual({
            content: ":warning: Embed field 1 value is too long. (1025 / 1024)"
        });

        expect(
            handler._applyLimits(
                {
                    embeds: [
                        {
                            fields: [{ name: "x".repeat(257), value: "Content" }]
                        }
                    ]
                },
                {
                    limitType: MessageLimitTypes.error
                }
            )
        ).toEqual({
            content: ":warning: Embed field 1 name is too long. (257 / 256)"
        });

        expect(
            handler._applyLimits(
                {
                    embeds: [
                        {
                            fields: Array(26).fill({ name: "f", value: "v" })
                        }
                    ]
                },
                {
                    limitType: MessageLimitTypes.error
                }
            )
        ).toEqual({
            content: ":warning: Embed has too many fields. (26 / 25)"
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
            0,
            {}
        );
        expect(handler._reply).toHaveBeenNthCalledWith(
            2,
            msg,
            expect.any(Function),
            {
                content: "two"
            },
            1,
            {}
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
        const destroyUserTracker = vi.spyOn(handler.userTracker, "destroy");

        handler.replyTracker.deleteWithCallback = vi.fn().mockResolvedValueOnce(true);
        await expect(
            handler.delete({
                id: "msg-1"
            })
        ).resolves.toBe(true);

        await handler.unload();

        expect(clearTrackedMsgs).toHaveBeenCalledTimes(1);
        expect(destroyUserTracker).toHaveBeenCalledTimes(1);

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

    test("guarantees content is cleared to empty string when editing replies without content", async () => {
        const handler = createHandler();
        handler.hasReplyTracker = false;

        const edit = vi.fn().mockResolvedValue("edited");
        handler.getReply = vi.fn().mockReturnValue({ edit });

        await handler.editReply({}, { embeds: [{ title: "test" }] });
        expect(edit).toHaveBeenCalledWith({
            content: "",
            embeds: [expect.any(Object)]
        });
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

    test("strips pings safely from getter-only Embed instances", () => {
        const getterOnlyEmbed = {
            get title() {
                return "@everyone title";
            },
            get description() {
                return "hello @here";
            },
            toJSON() {
                return {
                    title: this.title,
                    description: this.description
                };
            }
        };

        const out = {
            content: "@everyone",
            embeds: [getterOnlyEmbed]
        };

        expect(() => MessageHandler._stripPings(out)).not.toThrow();
        expect(out.embeds[0].title).toBe("\\@everyone title");
        expect(out.embeds[0].description).toBe("hello \\@here");
    });

    test("rate limits users when limit exceeded, bypassing mods", async () => {
        MessageHandler.resetRateLimiter();
        class TestMessageHandler extends MessageHandler {
            static $name = "testMessageHandler";
            execute() {}
        }
        const handler = new TestMessageHandler(true);
        handler.load();
        handler.reply = vi.fn().mockResolvedValue("replied");

        const userMsg = {
            author: { id: "user-123" }
        };

        const RateLimiter = (await import("../../../src/util/misc/RateLimiter.js")).default;
        MessageHandler.rateLimiter = new RateLimiter(2, 5000);

        expect(await handler.checkRateLimit(userMsg)).toBe(false);
        expect(await handler.checkRateLimit(userMsg)).toBe(false);
        expect(await handler.checkRateLimit(userMsg)).toBe(true);
        expect(handler.reply).toHaveBeenCalledTimes(1);
        expect(handler.reply).toHaveBeenCalledWith(userMsg, expect.stringContaining("slow down"));

        runtime.client.permManager.enabled = true;
        runtime.client.permManager.allowed = lvl => lvl >= 2;
        vi.spyOn(runtime.client.permManager, "maxLevel").mockResolvedValue(2);
        const modMsg = {
            author: { id: "mod-456" }
        };
        expect(await handler.checkRateLimit(modMsg)).toBe(false);
        expect(await handler.checkRateLimit(modMsg)).toBe(false);
        expect(await handler.checkRateLimit(modMsg)).toBe(false);

        await handler.unload();
        expect(handler.rateLimiter.getRemaining("user-123")).toBe(2);

        MessageHandler.resetRateLimiter();
    });

    test("supports cancellation via AbortSignal and cleans up aborted in-flight replies", async () => {
        class TestMessageHandler extends MessageHandler {
            static $name = "testMessageHandler";
            execute() {}
        }

        const handler = new TestMessageHandler(true, true);
        handler.load();

        const controller = new AbortController();
        controller.abort();

        const dummyMsg = {
            id: "msg-1",
            reply: vi.fn()
        };

        const res1 = await handler.reply(dummyMsg, "Hello", { signal: controller.signal });

        expect(res1).toBeNull();
        expect(dummyMsg.reply).not.toHaveBeenCalled();
        expect(handler.getReply(dummyMsg)).toBeNull();

        const deleteSpy = vi.fn(async () => undefined);

        let resolveReply;

        const slowMsg = {
            id: "msg-2",
            reply: vi.fn(
                () =>
                    new Promise(resolve => {
                        resolveReply = () =>
                            resolve({
                                id: "reply-slow",
                                delete: deleteSpy
                            });
                    })
            )
        };

        const activeController = new AbortController();

        const replyPromise = handler.reply(slowMsg, "In flight", {
            signal: activeController.signal,
            deleteOnAbort: true
        });

        activeController.abort();
        const res2 = await replyPromise;

        expect(res2).toBeNull();
        expect(handler.getReply(slowMsg)).toBeNull();

        resolveReply();
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(deleteSpy).toHaveBeenCalled();
        await handler.unload();
    });

    test("enforces maxFileSize on intended files and overflow files without excess allocation", () => {
        const handler = createHandler();
        handler._maxFileSize = 20;

        const oversizedIntended = handler._applyLimits(
            {
                content: "small",
                files: [{ attachment: Buffer.alloc(25) }]
            },
            {
                limitType: MessageLimitTypes.none
            }
        );

        expect(oversizedIntended.content).toContain("Cannot send response over **20 B**. (25 B / 20 B)");
        expect(oversizedIntended.files).toBeUndefined();

        const validIntended = handler._applyLimits(
            {
                content: "small",
                files: [{ attachment: Buffer.alloc(10) }]
            },
            {
                limitType: MessageLimitTypes.none
            }
        );

        expect(validIntended.files).toHaveLength(1);

        const oversizedOverflow = handler._applyLimits(
            {
                content: "a".repeat(30)
            },
            {
                limitType: MessageLimitTypes.file
            }
        );

        expect(oversizedOverflow.content).toContain("Cannot send response over **20 B**. (30 B / 20 B)");
        expect(oversizedOverflow.files).toBeUndefined();

        const validOverflow = handler._applyLimits(
            {
                content: "a".repeat(10)
            },
            {
                limitType: MessageLimitTypes.file
            }
        );

        expect(validOverflow.files).toHaveLength(1);

        const oversizedEmbed = handler._applyLimits(
            {
                embeds: [
                    {
                        description: "a".repeat(30)
                    }
                ]
            },
            {
                limitType: MessageLimitTypes.file
            }
        );

        expect(oversizedEmbed.content).toContain("Cannot send response over **20 B**");
        expect(oversizedEmbed.files).toBeUndefined();
    });

    test("setLimits reads from limits first, then config, and retains existing values", () => {
        const handler = createHandler();

        handler.setLimits({
            outCharLimit: 123,
            maxFileSize: 456
        });

        expect(handler._outCharLimit).toBe(123);
        expect(handler._maxFileSize).toBe(456);
        expect(handler._outLineLimit).toBe(2);
    });

    test("_attachOverflowFile attaches files to start or end properly", () => {
        const handler = createHandler();
        handler._maxFileSize = 100;

        const out = {
            files: [{ name: "existing.txt", attachment: Buffer.from("existing") }]
        };

        const [size1, err1] = handler._attachOverflowFile(out, "startContent", "start.txt", 8, "start");
        expect(err1).toBeNull();
        expect(size1).toBe(8 + 12);
        expect(out.files[0].name).toBe("start.txt");

        const [size2, err2] = handler._attachOverflowFile(out, "endContent", "end.txt", size1, "end");
        expect(err2).toBeNull();
        expect(out.files[out.files.length - 1].name).toBe("end.txt");
    });
});
