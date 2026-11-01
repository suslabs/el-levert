import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { cleanupRuntime, createRuntime } from "../../helpers/runtimeHarness.js";

import CommandError from "@el-levert/common/errors/CommandError.js";

let runtime;
let WebsocketCommandHandler;

beforeEach(async () => {
    runtime = await createRuntime({
        loadManagers: true,
        loadVMs: false,
        config: {
            enableWebsocket: true,
            websocketPort: 8081
        }
    });

    ({ default: WebsocketCommandHandler } = await import("../../../../src/handlers/misc/WebsocketCommandHandler.js"));
});

afterEach(async () => {
    await cleanupRuntime(runtime);
    runtime = null;
});

describe("WebsocketCommandHandler", () => {
    test("executes real commands, validates schema, and returns structured success response", async () => {
        const handler = new WebsocketCommandHandler(true);

        const mockSocket = {
            send: vi.fn(),
            clientId: "test_client_1"
        };

        const packet = {
            id: "msg_1",
            op: "version",
            data: {}
        };

        await handler.execute(packet, mockSocket);

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(mockSocket.send.mock.calls[0][0]);
        expect(response).toEqual({
            id: "msg_1",
            op: "version",
            status: "success",
            data: {
                version: runtime.client.version
            }
        });
    });

    test("returns structured error for missing commands", async () => {
        const handler = new WebsocketCommandHandler(true);

        const mockSocket = {
            send: vi.fn(),
            clientId: "test_client_1"
        };

        const packet = {
            id: "msg_2",
            op: "missing_command",
            data: {}
        };

        await handler.execute(packet, mockSocket);

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(mockSocket.send.mock.calls[0][0]);
        expect(response).toEqual({
            id: "msg_2",
            op: "missing_command",
            status: "error",
            data: 'Command "missing_command" not found.'
        });
    });

    test("returns structured error for missing required arguments", async () => {
        const handler = new WebsocketCommandHandler(true);

        const mockSocket = {
            send: vi.fn(),
            clientId: "test_client_1"
        };

        const packet = {
            id: "msg_3",
            op: "eval",
            data: {}
        };

        await handler.execute(packet, mockSocket);

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(mockSocket.send.mock.calls[0][0]);
        expect(response.status).toBe("error");
        expect(response.data).toContain("Missing required parameter: code");
    });

    test("enforces no more than 1 concurrent command in flight per clientId", async () => {
        const handler = new WebsocketCommandHandler(true);

        const mockSocket = {
            send: vi.fn(),
            clientId: "test_client_dup"
        };

        let resolveSlow;
        const slowCommand = {
            name: "slow_cmd",
            arguments: {},
            response: {},
            parseArguments: () => ({}),
            execute: () =>
                new Promise(resolve => {
                    resolveSlow = resolve;
                })
        };

        vi.spyOn(runtime.client.websocketCommandManager, "searchCommands").mockReturnValue(slowCommand);

        const firstPacket = {
            id: "first",
            op: "slow_cmd",
            data: {}
        };

        const secondPacket = {
            id: "second",
            op: "slow_cmd",
            data: {}
        };

        const p1 = handler.execute(firstPacket, mockSocket);
        const p2 = handler.execute(secondPacket, mockSocket);

        await p2;

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(mockSocket.send.mock.calls[0][0]);
        expect(response).toEqual({
            id: "second",
            op: "slow_cmd",
            status: "error",
            data: "Another command is already in flight for client: test_client_dup"
        });

        resolveSlow({});
        await p1;
    });

    test("enforces command execution timeout per client ID", async () => {
        const handler = new WebsocketCommandHandler(true);
        handler.globalTimeLimit = 10;

        const mockSocket = {
            send: vi.fn(),
            clientId: "test_client_timeout"
        };

        const slowCommand = {
            name: "slow_timeout_cmd",
            arguments: {},
            response: {},
            parseArguments: () => ({}),
            execute: async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return {};
            }
        };

        vi.spyOn(runtime.client.websocketCommandManager, "searchCommands").mockReturnValue(slowCommand);

        const packet = {
            id: "timeout_test",
            op: "slow_timeout_cmd",
            data: {}
        };

        await handler.execute(packet, mockSocket);

        expect(mockSocket.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(mockSocket.send.mock.calls[0][0]);
        expect(response.status).toBe("error");
        expect(response.data).toContain('Timed out executing command "slow_timeout_cmd"');
    });
});
