import { afterEach, describe, expect, test, vi } from "vitest";
import "../../../../setupGlobals.js";

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

describe("InspectorServer branch coverage", () => {
    test("builds the inspector url and ignores disabled operations", async () => {
        const { default: InspectorServer } = await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js");

        const server = new InspectorServer(false, 9999);

        expect(server.inspectorUrl).toContain("ws=localhost%3A9999");

        server.setup();
        server.setContext({});
        server.executionFinished();
        server.close();

        expect(server.running).toBe(false);
    });

    test("binds websocket events, relays messages, and cleans up connections", async () => {
        const { default: InspectorServer } = await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js");

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

        server.setContext({
            inspector
        });

        mocked.servers[0].handlers.connection(socket);
        expect(inspector.onConnection).toHaveBeenCalledOnce();

        socket.handlers.message(Buffer.from("{\"id\":1}"));
        expect(inspector.sendMessage).toHaveBeenCalledWith("{\"id\":1}");

        server.sendReply("reply");
        expect(socket.send).toHaveBeenCalledWith("reply");

        inspector.sendMessage.mockImplementationOnce(() => {
            throw new Error("dispatch failed");
        });

        socket.handlers.message(Buffer.from("{\"id\":2}"));
        expect(socket.close).toHaveBeenCalledTimes(2);

        socket.handlers.error(new Error("socket error"));
        socket.handlers.close(1000);

        expect(inspector.onDisconnect).toHaveBeenCalledTimes(2);

        server.executionFinished();
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
});
