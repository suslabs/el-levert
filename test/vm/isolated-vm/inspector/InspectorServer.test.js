import { afterEach, describe, expect, test, vi } from "vitest";
import "../../../../setupGlobals.js";
import net from "node:net";
import ivm from "isolated-vm";
import WebSocket, { WebSocketServer } from "ws";

const mocked = vi.hoisted(() => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    },
    servers: []
}));

vi.mock("../../../../src/LevertClient.js", () => ({
    getLogger: () => mocked.logger
}));

globalThis.WebSocket = {
    CLOSED: 3,
    Server: class {
        constructor(options) {
            this.options = options;
            this.handlers = {};
            this.close = vi.fn(() => {
                this.handlers.close?.();
            });

            mocked.servers.push(this);
        }

        on(name, listener) {
            this.handlers[name] = listener;
        }
    }
};

afterEach(() => {
    vi.restoreAllMocks();
    mocked.servers.length = 0;

    for (const method of Object.values(mocked.logger)) {
        method.mockReset();
    }
});

function getOpenPort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();

        server.on("error", reject);
        server.listen(0, "127.0.0.1", () => {
            const { port } = server.address();

            server.close(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve(port);
                }
            });
        });
    });
}

function waitForSocketEvent(socket, event) {
    return new Promise((resolve, reject) => {
        socket.once(event, resolve);
        socket.once("error", reject);
    });
}

function createProtocolClient(port) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`),
        pending = new Map(),
        contexts = [],
        contextWaiters = [];

    let id = 0;

    socket.on("message", data => {
        const msg = JSON.parse(data.toString("utf-8"));

        if (msg.id != null) {
            pending.get(msg.id)?.(msg);
            pending.delete(msg.id);
            return;
        }

        if (msg.method !== "Runtime.executionContextCreated") {
            return;
        }

        const context = msg.params.context;

        if (context.name !== "<isolated-vm>") {
            return;
        }

        contexts.push(context.id);
        contextWaiters.shift()?.(context.id);
    });

    return {
        socket,

        async open() {
            await waitForSocketEvent(socket, "open");
        },

        send(method, params) {
            const msgId = ++id,
                msg = {
                    id: msgId,
                    method,
                    params
                };

            const res = new Promise(resolve => pending.set(msgId, resolve));
            socket.send(JSON.stringify(msg));

            return res;
        },

        nextContext() {
            return contexts.length > 0 ? contexts.shift() : new Promise(resolve => contextWaiters.push(resolve));
        },

        close() {
            socket.close();
        }
    };
}

async function createInspectorContext(label, sendReply) {
    const { default: IsolateInspector } = await import("../../../../src/vm/isolated-vm/inspector/IsolateInspector.js");
    const isolate = new ivm.Isolate({
            inspector: true
        }),
        context = await isolate.createContext({
            inspector: true
        }),
        inspector = new IsolateInspector(true, {
            sendReply,
            connectTimeout: 250
        });

    await context.global.set("global", context.global.derefInto());
    await context.eval(`globalThis.__inspectorLabel = ${JSON.stringify(label)}`);

    inspector.create(isolate);

    return {
        inspector,

        dispose() {
            inspector.dispose();
            context.release();

            if (!isolate.isDisposed) {
                isolate.dispose();
            }
        }
    };
}

async function evalLabel(client) {
    await client.send("Runtime.enable");

    const contextId = await client.nextContext(),
        res = await client.send("Runtime.evaluate", {
            expression: "globalThis.__inspectorLabel",
            contextId,
            returnByValue: true
        });

    return res.result.result.value;
}

describe("InspectorServer branch coverage", () => {
    test("builds the inspector url and ignores disabled operations", async () => {
        const { default: InspectorServer } =
            await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js");

        const server = new InspectorServer(false, 9999);

        expect(server.inspectorUrl).toContain("ws=localhost%3A9999");

        server.setup();
        server.pushContext({});
        server.popContext({});
        server.close();

        expect(server.running).toBe(false);
    });

    test("binds websocket events, relays messages, and cleans up connections", async () => {
        const { default: InspectorServer } =
            await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js");

        const server = new InspectorServer(true, 9230, {
            logPackets: true
        });

        server.setup();

        expect(server.running).toBe(true);
        expect(mocked.servers).toHaveLength(1);

        const socket = {
            close: vi.fn(),
            on: vi.fn((name, listener) => {
                socket.handlers[name] = listener;
            }),
            readyState: 1,
            send: vi.fn(),
            handlers: {}
        };

        mocked.servers[0].handlers.connection(socket);

        expect(socket.close).toHaveBeenCalledOnce();

        const inspector = {
            connected: false,
            onConnection: vi.fn(() => {
                inspector.connected = true;
            }),
            onDisconnect: vi.fn(() => {
                inspector.connected = false;
            }),
            sendMessage: vi.fn()
        };

        const parent = {
            inspector
        };

        server.pushContext(parent);

        mocked.servers[0].handlers.connection(socket);
        expect(inspector.onConnection).toHaveBeenCalledOnce();

        socket.handlers.message(Buffer.from('{"id":1}'));
        expect(inspector.sendMessage).toHaveBeenCalledWith('{"id":1}');

        server.sendReply("reply");
        expect(socket.send).toHaveBeenCalledWith("reply");

        inspector.sendMessage.mockImplementationOnce(() => {
            throw new Error("dispatch failed");
        });

        socket.handlers.message(Buffer.from('{"id":2}'));
        expect(socket.close).toHaveBeenCalledTimes(2);

        socket.handlers.error(new Error("socket error"));
        socket.handlers.close(1000);

        expect(inspector.onDisconnect).toHaveBeenCalledTimes(2);

        const childInspector = {
            connected: false,
            onConnection: vi.fn(() => {
                childInspector.connected = true;
            }),
            onDisconnect: vi.fn(() => {
                childInspector.connected = false;
            }),
            sendMessage: vi.fn()
        };

        const child = {
            inspector: childInspector
        };

        server.pushContext(child);
        expect(inspector.onDisconnect).toHaveBeenCalledTimes(3);
        expect(childInspector.onConnection).toHaveBeenCalledOnce();

        server.popContext(child);
        expect(childInspector.onDisconnect).toHaveBeenCalledOnce();
        expect(inspector.onConnection).toHaveBeenCalledTimes(2);

        server.popContext(parent);
        expect(server.running).toBe(false);
        expect(server._inspectorSocket).toBeNull();

        const openSocket = {
            close: vi.fn(),
            readyState: 1
        };

        server._inspectorSocket = openSocket;
        server._closeSocket();
        expect(openSocket.close).toHaveBeenCalledOnce();

        server._inspectorSocket = {
            close: vi.fn(),
            readyState: WebSocket.CLOSED
        };

        server._closeSocket();

        server.close();
        expect(mocked.servers[0].close).toHaveBeenCalled();
    });

    test("routes real inspector protocol messages to the active context", async () => {
        const { default: InspectorServer } =
            await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js");

        const mockWebSocket = globalThis.WebSocket,
            port = await getOpenPort();

        WebSocket.Server = WebSocketServer;
        globalThis.WebSocket = WebSocket;

        const server = new InspectorServer(true, port),
            parent = await createInspectorContext("parent", server.sendReply),
            child = await createInspectorContext("child", server.sendReply),
            client = createProtocolClient(port);

        try {
            server.setup();
            server.pushContext(parent);

            await client.open();
            expect(await evalLabel(client)).toBe("parent");

            server.pushContext(child);
            expect(await evalLabel(client)).toBe("child");

            server.popContext(child);
            expect(await evalLabel(client)).toBe("parent");

            server.popContext(parent);
            await waitForSocketEvent(client.socket, "close");
        } finally {
            client.close();
            parent.dispose();
            child.dispose();
            server.close();
            globalThis.WebSocket = mockWebSocket;
        }
    });
});
