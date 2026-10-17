import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { WebSocket } from "ws";

import { createRuntime, cleanupRuntime } from "../helpers/runtimeHarness.js";

import GatewayClient from "../../scripts/GatewayClient.js";

const port = Math.floor(20000 + Math.random() * 10000),
    url = `ws://localhost:${port}`;

describe("Gateway protocol and GatewayClient", () => {
    let runtime;

    beforeAll(async () => {
        runtime = await createRuntime({
            loadManagers: true,
            loadHandlers: true,
            loadVMs: true,
            config: {
                enableWebsocket: true,
                websocketPort: port
            }
        });

        runtime.client.gatewayManager.handleMessage = runtime.client.websocketCommandHandler.execute;
        runtime.client.gatewayManager.active = true;

        await new Promise(resolve => setTimeout(resolve, 500));
    });

    afterAll(async () => {
        await cleanupRuntime(runtime);
    });

    test("client can connect, identify and receive READY", async () => {
        const client = new GatewayClient(url, {
            clientId: "test_client_1",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500
        });

        await client.connect();

        expect(client.connected).toBe(true);
        expect(client.sessionId).toBeTypeOf("string");
        expect(client.sessionId.length).toBeGreaterThan(0);

        client.close();
    });

    test("rejects duplicate client ID with INVALID_SESSION and closes connection", async () => {
        const client1 = new GatewayClient(url, {
            clientId: "test_duplicate_cli",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500
        });

        await client1.connect();
        expect(client1.connected).toBe(true);

        const client2 = new GatewayClient(url, {
            clientId: "test_duplicate_cli",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500
        });

        await expect(client2.connect()).rejects.toThrow("already connected");
        expect(client2.connected).toBe(false);

        client1.close();
        client2.close();
    });

    test("client can resume session after disconnect", async () => {
        const client = new GatewayClient(url, {
            clientId: "test_resume_cli",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500,
            maxReconnectAttempts: 0
        });

        await client.connect();
        expect(client.connected).toBe(true);

        const firstSessionId = client.sessionId;
        expect(firstSessionId).toBeTypeOf("string");

        await client.reconnect();

        expect(client.connected).toBe(true);
        expect(client.sessionId).toBe(firstSessionId);

        client.close();
    });

    test("commands are blocked before identification", async () => {
        const rawWs = new WebSocket(url);

        const receivedClose = new Promise(resolve => {
            rawWs.on("close", (code, reason) => {
                resolve({ code, reason: reason.toString() });
            });
        });

        rawWs.on("open", () => {
            rawWs.send(
                JSON.stringify({
                    id: "1",
                    op: "version",
                    data: {}
                })
            );
        });

        const closeInfo = await receivedClose;
        expect(closeInfo.code).toBe(4003);
    });

    test("commands work after identifying", async () => {
        const client = new GatewayClient(url, {
            clientId: "test_command_cli",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500
        });

        await client.connect();

        const res = await client.sendRequest("version", {});
        expect(res.status).toBe("success");
        expect(res.data.version).toBeTypeOf("string");

        client.close();
    });

    test("closes connection with RATE_LIMITED when packet limit is exceeded", async () => {
        const rawWs = new WebSocket(url);

        const receivedClose = new Promise(resolve => {
            rawWs.on("close", (code, reason) => {
                resolve({ code, reason: reason.toString() });
            });
        });

        rawWs.on("open", () => {
            for (let i = 0; i < 105; i++) {
                rawWs.send(
                    JSON.stringify({
                        op: 1,
                        d: null
                    })
                );
            }
        });

        const closeInfo = await receivedClose;
        expect(closeInfo.code).toBe(4008);
    });

    test("client handles RATE_LIMITED close from gateway and emits rate_limited", async () => {
        const client = new GatewayClient(url, {
            clientId: "test_gateway_ratelimit",
            connectTimeout: 2000,
            pingInterval: 1000,
            pongTimeout: 500,
            maxRetryCount: 0,
            maxReconnectAttempts: 1,
            rateLimitBackoff: 200
        });

        await client.connect();
        expect(client.connected).toBe(true);
        const originalSessionId = client.sessionId;

        const rateLimitedPromise = new Promise(resolve => {
            client.once("rate_limited", data => resolve(data));
        });

        const closePromise = new Promise(resolve => {
            client.once("close", code => resolve(code));
        });

        const pendingRequests = [];
        for (let i = 0; i < 110; i++) {
            pendingRequests.push(client.sendRequest("version", {}).catch(err => err));
        }

        const rateLimitData = await rateLimitedPromise;
        expect(rateLimitData.code).toBe(4008);

        const closeCode = await closePromise;
        expect(closeCode).toBe(4008);

        const results = await Promise.all(pendingRequests);
        const rateLimitErrors = results.filter(res => res instanceof Error && res.message.includes("rate limit"));
        expect(rateLimitErrors.length).toBeGreaterThan(0);

        await new Promise(resolve => setTimeout(resolve, 500));
        expect(client.sessionId).toBe(originalSessionId);

        client.close();
    });
});
