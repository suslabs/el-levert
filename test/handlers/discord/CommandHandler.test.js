import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createDiscordMessage } from "../../helpers/discordStubs.js";
import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let CommandHandler;
let handler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadVMs: true,
        loadHandlers: true
    });

    ({ default: CommandHandler } = await import("../../../src/handlers/discord/CommandHandler.js"));
    handler = runtime.client.commandHandler;
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("CommandHandler", () => {
    test("ignores non-commands and executes real commands through the reply path", async () => {
        const plainMsg = createDiscordMessage("hello there", {
            reply: vi.fn(async data => ({ content: data }))
        });

        expect(await handler.execute(plainMsg)).toBe(false);
        expect(plainMsg.reply).not.toHaveBeenCalled();

        const addMsg = createDiscordMessage("%tag add alpha body", {
            reply: vi.fn(async data => ({ content: typeof data === "string" ? data : data.content }))
        });

        expect(await handler.execute(addMsg)).toBe(true);
        expect(addMsg.reply).toHaveBeenCalledWith({
            content: ":white_check_mark: Created tag **alpha**."
        });

        const runMsg = createDiscordMessage("%tag alpha", {
            reply: vi.fn(async data => ({ content: typeof data === "string" ? data : data.content }))
        });

        expect(await handler.execute(runMsg)).toBe(true);
        expect(runMsg.reply).toHaveBeenCalledWith({
            content: "body"
        });
    });

    test("reports real execution failures through replyWithError", async () => {
        await runtime.client.tagManager.add("broken", "(", "user-1", "ivm");

        const msg = createDiscordMessage("%tag broken", {
            reply: vi.fn(async data => data)
        });

        expect(await handler.execute(msg)).toBe(true);

        const [reply] = msg.reply.mock.calls[0];
        expect(reply.content).toContain("Encountered exception while executing command **tag**");
        expect(reply.files).toHaveLength(1);
    });

    test("supports stateful command-managed replies and edits", async () => {
        const deleteSpy = vi.fn(async () => undefined);
        const editSpy = vi.fn(async data => ({
            id: "reply-1",
            content: typeof data === "string" ? data : data.content,
            edit: editSpy,
            delete: deleteSpy
        }));
        const msg = createDiscordMessage("%stateful", {
            reply: vi.fn(async data => ({
                id: "reply-1",
                content: typeof data === "string" ? data : data.content,
                edit: editSpy,
                delete: deleteSpy
            }))
        });

        runtime.client.commandManager = {
            isCommand: vi.fn(() => true),
            getCommand: vi.fn(() => [
                {
                    name: "stateful",
                    async execute(context) {
                        await context.reply("First reply");
                        await context.edit("Second reply");
                    }
                },
                "stateful",
                "",
                {
                    raw: msg.content,
                    content: "stateful",
                    name: "stateful",
                    argsText: ""
                }
            ])
        };

        expect(await handler.execute(msg)).toBe(true);
        expect(msg.reply).toHaveBeenCalledWith({
            content: "First reply"
        });
        expect(editSpy).toHaveBeenCalledWith({
            content: "Second reply"
        });
    });

    test("shows a processing reply for slow commands and edits it with the final output", async () => {
        handler.commandWaitTime = 1;

        const deleteSpy = vi.fn(async () => undefined);
        const editSpy = vi.fn(async data => ({
            id: "reply-1",
            content: typeof data === "string" ? data : data.content,
            edit: editSpy,
            delete: deleteSpy
        }));
        const msg = createDiscordMessage("%slow", {
            reply: vi.fn(async data => ({
                id: "reply-1",
                content: typeof data === "string" ? data : data.content,
                edit: editSpy,
                delete: deleteSpy
            }))
        });

        runtime.client.commandManager = {
            isCommand: vi.fn(() => true),
            getCommand: vi.fn(() => [
                {
                    name: "slow",
                    async execute() {
                        await new Promise(resolve => setTimeout(resolve, 10));
                        return "Done";
                    }
                },
                "slow",
                "",
                {
                    raw: msg.content,
                    content: "slow",
                    name: "slow",
                    argsText: ""
                }
            ])
        };

        expect(await handler.execute(msg)).toBe(true);
        expect(msg.reply).toHaveBeenCalledWith({
            content: ":hourglass_flowing_sand: Processing command..."
        });
        expect(editSpy).toHaveBeenCalledWith({
            content: "Done"
        });
    });

    test("times out slow commands and edits the processing reply with a warning", async () => {
        handler.commandWaitTime = 1;
        handler.globalTimeLimit = 5;

        const deleteSpy = vi.fn(async () => undefined);
        const editSpy = vi.fn(async data => ({
            id: "reply-1",
            content: typeof data === "string" ? data : data.content,
            edit: editSpy,
            delete: deleteSpy
        }));
        const msg = createDiscordMessage("%slow-timeout", {
            reply: vi.fn(async data => ({
                id: "reply-1",
                content: typeof data === "string" ? data : data.content,
                edit: editSpy,
                delete: deleteSpy
            }))
        });

        runtime.client.commandManager = {
            isCommand: vi.fn(() => true),
            getCommand: vi.fn(() => [
                {
                    name: "slow-timeout",
                    async execute() {
                        await new Promise(resolve => setTimeout(resolve, 20));
                        return "Too late";
                    }
                },
                "slow-timeout",
                "",
                {
                    raw: msg.content,
                    content: "slow-timeout",
                    name: "slow-timeout",
                    argsText: ""
                }
            ])
        };

        expect(await handler.execute(msg)).toBe(true);
        expect(msg.reply).toHaveBeenCalledWith({
            content: ":hourglass_flowing_sand: Processing command..."
        });
        expect(editSpy).toHaveBeenCalledWith({
            content: ':no_entry_sign: Timed out executing command **slow-timeout**.'
        });
    });

    test("resubmit reruns edited commands and removes prior tracked replies", async () => {
        const firstDeleteSpy = vi.fn(async () => undefined);
        const secondDeleteSpy = vi.fn(async () => undefined);
        const replies = [
            {
                id: "reply-1",
                content: "Initial",
                edit: vi.fn(async data => ({
                    id: "reply-1",
                    content: typeof data === "string" ? data : data.content,
                    edit: vi.fn(),
                    delete: firstDeleteSpy
                })),
                delete: firstDeleteSpy
            },
            {
                id: "reply-2",
                content: "Edited",
                edit: vi.fn(async data => ({
                    id: "reply-2",
                    content: typeof data === "string" ? data : data.content,
                    edit: vi.fn(),
                    delete: secondDeleteSpy
                })),
                delete: secondDeleteSpy
            }
        ];
        const msg = createDiscordMessage("%demo first", {
            id: "msg-1",
            reply: vi.fn(async data => {
                const reply = replies.shift();
                return {
                    ...reply,
                    content: typeof data === "string" ? data : data.content
                };
            })
        });
        const executionFlags = [];

        runtime.client.commandManager = {
            isCommand: vi.fn(content => typeof content === "string" && content.startsWith("%")),
            getCommand: vi.fn(content => {
                const argsText = content.split(" ").slice(1).join(" ");

                return [
                    {
                        name: "demo",
                        async execute(context) {
                            executionFlags.push(context.isEdit);
                            return context.isEdit ? "Edited" : "Initial";
                        }
                    },
                    "demo",
                    argsText,
                    {
                        raw: content,
                        content: content.slice(1),
                        name: "demo",
                        argsText
                    }
                ];
            })
        };

        expect(await handler.execute(msg)).toBe(true);

        msg.content = "%demo second";
        expect(await handler.resubmit(msg)).toBe(true);

        expect(firstDeleteSpy).toHaveBeenCalledTimes(1);
        expect(msg.reply).toHaveBeenNthCalledWith(1, {
            content: "Initial"
        });
        expect(msg.reply).toHaveBeenNthCalledWith(2, {
            content: "Edited"
        });
        expect(executionFlags).toEqual([false, true]);
    });

    test("resubmit removes tracked replies when an edited message is no longer a command", async () => {
        const deleteSpy = vi.fn(async () => undefined);
        const msg = createDiscordMessage("%demo", {
            id: "msg-2",
            reply: vi.fn(async data => ({
                id: "reply-1",
                content: typeof data === "string" ? data : data.content,
                edit: vi.fn(),
                delete: deleteSpy
            }))
        });

        runtime.client.commandManager = {
            isCommand: vi.fn(content => typeof content === "string" && content.startsWith("%")),
            getCommand: vi.fn(content => [
                {
                    name: "demo",
                    async execute() {
                        return "Initial";
                    }
                },
                "demo",
                "",
                {
                    raw: content,
                    content: "demo",
                    name: "demo",
                    argsText: ""
                }
            ])
        };

        expect(await handler.execute(msg)).toBe(true);

        msg.content = "not a command anymore";
        expect(await handler.resubmit(msg)).toBe(true);

        expect(deleteSpy).toHaveBeenCalledTimes(1);
        expect(msg.reply).toHaveBeenCalledTimes(1);
    });
});
