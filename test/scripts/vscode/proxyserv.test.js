import { afterEach, describe, expect, test, vi } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const Module = require("module");

let originalLoad = null;

afterEach(() => {
    if (originalLoad !== null) {
        Module._load = originalLoad;
        originalLoad = null;
    }
});

describe("proxyserv", () => {
    test("serves inspector metadata and proxies websocket traffic", () => {
        const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        let reqHandler = null;
        const httpServer = {
            handlers: {},
            on: vi.fn((event, handler) => {
                httpServer.handlers[event] = handler;
            }),
            listen: vi.fn((port, cb) => cb())
        };

        const http = {
            createServer: vi.fn(handler => {
                reqHandler = handler;
                return httpServer;
            })
        };

        const createdSockets = [];
        let wsServerInstance = null;

        function MockWebSocket(url) {
            this.url = url;
            this.readyState = MockWebSocket.OPEN;
            this.handlers = {};
            this.send = vi.fn();
            this.close = vi.fn();
            this.on = vi.fn((event, handler) => {
                this.handlers[event] = handler;
            });
            createdSockets.push(this);
        }

        MockWebSocket.OPEN = 1;
        MockWebSocket.Server = class Server {
            constructor(options) {
                wsServerInstance = this;
                this.options = options;
                this.handlers = {};
                this.handleUpgrade = vi.fn((req, socket, head, cb) => {
                    const ws = {
                        readyState: MockWebSocket.OPEN,
                        handlers: {},
                        send: vi.fn(),
                        close: vi.fn(),
                        on: vi.fn((event, handler) => {
                            ws.handlers[event] = handler;
                        })
                    };

                    this.lastUpgradedSocket = ws;
                    cb(ws);
                });
                this.emit = vi.fn((event, ...args) => this.handlers[event]?.(...args));
                this.on = vi.fn((event, handler) => {
                    this.handlers[event] = handler;
                });
            }
        };

        originalLoad = Module._load;
        Module._load = function patchedLoad(request, parent, isMain) {
            if (request === "http") {
                return http;
            } else if (request === "ws") {
                return MockWebSocket;
            }

            return originalLoad.call(this, request, parent, isMain);
        };

        const file = path.resolve("scripts/vscode/proxyserv.cjs");
        delete require.cache[require.resolve(file)];
        require(file);

        const jsonRes = {
            writeHead: vi.fn(),
            end: vi.fn()
        };
        reqHandler({ url: "/json/version" }, jsonRes);
        expect(jsonRes.writeHead).toHaveBeenCalledWith(200, { "Content-Type": "application/json" });

        const listRes = {
            writeHead: vi.fn(),
            end: vi.fn()
        };
        reqHandler({ url: "/json/list" }, listRes);
        expect(listRes.end).toHaveBeenCalledWith(expect.stringContaining("webSocketDebuggerUrl"));

        const missingRes = {
            writeHead: vi.fn(),
            end: vi.fn()
        };
        reqHandler({ url: "/missing" }, missingRes);
        expect(missingRes.writeHead).toHaveBeenCalledWith(404, { "Content-Type": "text/plain" });

        httpServer.handlers.upgrade({}, {}, Buffer.alloc(0));
        const proxyWs = createdSockets[0];
        proxyWs.handlers.open();

        expect(http.createServer).toHaveBeenCalled();

        const upgradedWs = wsServerInstance?.lastUpgradedSocket;

        if (upgradedWs) {
            upgradedWs.handlers.message?.("to-proxy");
            expect(proxyWs.send).toHaveBeenCalledWith("to-proxy");

            proxyWs.handlers.message?.("to-client");
            expect(upgradedWs.send).toHaveBeenCalledWith("to-client");

            upgradedWs.handlers.close?.();
            expect(proxyWs.close).toHaveBeenCalled();

            proxyWs.handlers.close?.();
            expect(upgradedWs.close).toHaveBeenCalled();
        }

        proxyWs.handlers.error?.({ code: "ECONNREFUSED" });
        proxyWs.handlers.error?.({ code: "EOTHER", message: "bad" });

        consoleLog.mockRestore();
        consoleError.mockRestore();
    });
});
