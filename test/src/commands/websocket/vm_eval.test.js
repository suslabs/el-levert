import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

let runtime;
let WebsocketCommandHandler;

function getResponse(socket, idx = 0) {
    return JSON.parse(socket.send.mock.calls[idx][0]);
}

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadVMs: false,
        config: {
            enableWebsocket: true,
            websocketPort: 0
        }
    });

    ({ default: WebsocketCommandHandler } = await import("../../../../src/handlers/misc/WebsocketCommandHandler.js"));

    runtime.client.tagVM = {
        runScript: vi.fn((code, values) => ({
            code,
            embed: values.msg.embeds[0]?.data.description ?? null,
            msgId: values.msg.id,
            ref: values.msg.reference?.messageId ?? null,
            reactCount: values.msg.reactions?.length ?? 0,
            everyone: values.msg.mentions?.everyone ?? false,
            url: values.msg.attachments.first()?.url ?? null
        }))
    };
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("websocket vm_eval command", () => {
    test("passes structured emulated messages into vm eval", async () => {
        const handler = new WebsocketCommandHandler(true),
            socket = {
                send: vi.fn(),
                clientId: "client-1"
            };

        await handler.execute(
            {
                id: "vm-good",
                op: "vm_eval",
                data: {
                    code: "1 + 1",
                    msg: {
                        author: {
                            id: "222"
                        },
                        guild: {
                            id: "333"
                        },
                        channel: {
                            id: "444"
                        },
                        message: {
                            id: "712345678901234567",
                            attachments: ["https://example.com/code.js"],
                            embeds: [{ description: "eval embed" }],
                            reactions: [
                                {
                                    emoji: {
                                        name: "🔥"
                                    }
                                }
                            ],
                            mentions: {
                                everyone: true
                            }
                        }
                    }
                }
            },
            socket
        );

        expect(getResponse(socket)).toEqual({
            id: "vm-good",
            op: "vm_eval",
            status: "success",
            data: {
                output: {
                    code: "1 + 1",
                    embed: "eval embed",
                    msgId: "712345678901234567",
                    ref: null,
                    reactCount: 1,
                    everyone: true,
                    url: "https://example.com/code.js"
                }
            }
        });
    });

    test("rejects invalid msg payload types", async () => {
        const handler = new WebsocketCommandHandler(true),
            socket = {
                send: vi.fn(),
                clientId: "client-2"
            };

        await handler.execute(
            {
                id: "vm-bad",
                op: "vm_eval",
                data: {
                    code: "1 + 1",
                    msg: "wrong"
                }
            },
            socket
        );

        expect(getResponse(socket)).toEqual({
            id: "vm-bad",
            op: "vm_eval",
            status: "error",
            data: expect.stringContaining('Invalid type for field "msg"')
        });
    });
});
