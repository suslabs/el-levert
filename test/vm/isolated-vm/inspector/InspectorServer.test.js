import { afterEach, describe, expect, test, vi } from "vitest";

import "../../../../setupGlobals.js";

import net from "node:net";

import ivm from "isolated-vm";
import WebSocket from "ws";

import { InspectorModes } from "../../../../src/vm/isolated-vm/inspector/InspectorModes.js";

const mocked = vi.hoisted(() => ({
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}));

vi.mock("../../../../src/LevertClient.js", () => ({
    getLogger: () => mocked.logger
}));

async function getOpenPort() {
    return await new Promise((resolve, reject) => {
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

async function waitForServer(url) {
    for (let i = 0; i < 50; i++) {
        try {
            const res = await fetch(url);

            if (res.status < 500) {
                return;
            }
        } catch {}

        await new Promise(resolve => setTimeout(resolve, 20));
    }

    throw new Error("Inspector server did not start in time");
}

function waitForSocketEvent(socket, event) {
    return new Promise((resolve, reject) => {
        socket.once(event, resolve);
        socket.once("error", reject);
    });
}

function createProtocolClient(url) {
    const socket = new WebSocket(url),
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

        close() {
            socket.close();
        },

        nextContext() {
            return contexts.length > 0 ? contexts.shift() : new Promise(resolve => contextWaiters.push(resolve));
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
        }
    };
}

async function evalLabel(client) {
    await client.send("Runtime.enable");

    const contextId = await client.nextContext(),
        res = await client.send("Runtime.evaluate", {
            contextId,
            expression: "globalThis.__inspectorLabel",
            returnByValue: true
        });

    return res.result.result.value;
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
            connectTimeout: 250,
            sendReply
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

afterEach(() => {
    vi.restoreAllMocks();

    for (const method of Object.values(mocked.logger)) {
        method.mockReset();
    }
});

describe("InspectorServer", () => {
    test("publishes root node inspector metadata in console mode and routes protocol traffic", async () => {
        const { default: InspectorServer } =
                await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js"),
            port = await getOpenPort(),
            server = new InspectorServer(true, port, {
                mode: InspectorModes.console
            }),
            baseUrl = `http://127.0.0.1:${port}`;

        server.setup();
        await waitForServer(`${baseUrl}/json/version`);

        const session = server.getConsoleSession(),
            inspectorContext = await createInspectorContext("console", session.sendReply);

        try {
            session.pushContext(inspectorContext);

            const versionRes = await fetch(`${baseUrl}/json/version`),
                listRes = await fetch(`${baseUrl}/json/list`),
                version = await versionRes.json(),
                list = await listRes.json();

            expect(version).toMatchObject({
                Browser: `node.js/${process.version}`,
                "Protocol-Version": "1.1"
            });

            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({
                id: session.uuid,
                type: "node"
            });
            expect(list[0].webSocketDebuggerUrl).toContain(`/${session.uuid}`);
            expect(server.inspectorUrl).toContain(`localhost%3A${port}%2F${session.uuid}`);

            const client = createProtocolClient(list[0].webSocketDebuggerUrl);

            try {
                await client.open();
                expect(await evalLabel(client)).toBe("console");
            } finally {
                client.close();
            }
        } finally {
            session.popContext(inspectorContext);
            inspectorContext.dispose();
            server.close();
        }
    });

    test("scopes user inspector discovery to per-session uuid paths", async () => {
        const { default: InspectorServer } =
                await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js"),
            port = await getOpenPort(),
            server = new InspectorServer(true, port, {
                mode: InspectorModes.user
            }),
            baseUrl = `http://127.0.0.1:${port}`;

        server.setup();
        await waitForServer(baseUrl);

        const sessionA = server.createUserSession({
                title: "user-a",
                userId: "user-a"
            }),
            sessionB = server.createUserSession({
                title: "user-b",
                userId: "user-b"
            }),
            contextA = await createInspectorContext("alpha", sessionA.sendReply),
            contextB = await createInspectorContext("beta", sessionB.sendReply);

        try {
            sessionA.pushContext(contextA);
            sessionB.pushContext(contextB);

            const rootRes = await fetch(`${baseUrl}/json/list`);
            expect(rootRes.status).toBe(404);

            const listARes = await fetch(`${baseUrl}/${sessionA.uuid}/json/list`),
                listBRes = await fetch(`${baseUrl}/${sessionB.uuid}/json/list`),
                listA = await listARes.json(),
                listB = await listBRes.json();

            expect(listA).toHaveLength(1);
            expect(listB).toHaveLength(1);

            expect(listA[0].id).toBe(sessionA.uuid);
            expect(listB[0].id).toBe(sessionB.uuid);

            expect(JSON.stringify(listA)).not.toContain(sessionB.uuid);
            expect(JSON.stringify(listB)).not.toContain(sessionA.uuid);

            const client = createProtocolClient(listA[0].webSocketDebuggerUrl);

            try {
                await client.open();
                expect(await evalLabel(client)).toBe("alpha");
            } finally {
                client.close();
            }

            await expect(
                fetch(`${baseUrl}/missing-session/json/list`).then(async res => ({
                    body: await res.text(),
                    status: res.status
                }))
            ).resolves.toMatchObject({
                body: "404 Not Found",
                status: 404
            });
        } finally {
            sessionA.popContext(contextA);
            sessionB.popContext(contextB);

            contextA.dispose();
            contextB.dispose();

            server.close();
        }
    });

    test("rejects a second active user session for the same user", async () => {
        const { default: InspectorServer } =
                await import("../../../../src/vm/isolated-vm/inspector/InspectorServer.js"),
            port = await getOpenPort(),
            server = new InspectorServer(true, port, {
                mode: InspectorModes.user
            });

        server.setup();

        try {
            server.createUserSession({
                userId: "user-a"
            });

            expect(() =>
                server.createUserSession({
                    userId: "user-a"
                })
            ).toThrow("User already has an active inspector session.");
        } finally {
            server.close();
        }
    });
});
