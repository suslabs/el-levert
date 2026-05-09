import { afterEach, describe, expect, test, vi } from "vitest";
import "../../../../setupGlobals.js";
import IsolateInspector from "../../../../src/vm/isolated-vm/inspector/IsolateInspector.js";

const mocked = vi.hoisted(() => ({
    addDebuggerStmt: vi.fn(code => `debugger;\n${code}`),
    logger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn()
    }
}));

vi.mock("../../../../src/LevertClient.js", () => ({
    getLogger: () => mocked.logger
}));

vi.mock("../../../../src/util/vm/VMUtil.js", () => ({
    default: {
        addDebuggerStmt: mocked.addDebuggerStmt
    }
}));


afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

    for (const method of Object.values(mocked.logger)) {
        method.mockReset();
    }

    mocked.addDebuggerStmt.mockClear();
});

describe("IsolateInspector branch coverage", () => {
    test("guards disabled mode and validates constructor requirements", async () => {
        expect(() => new IsolateInspector(true, {})).toThrow("No reply function provided");

        const inspector = new IsolateInspector(false, {});

        expect(inspector.getDebuggerCode("1 + 1")).toBe("1 + 1");
        await expect(inspector.waitForConnection()).resolves.toBeUndefined();

        inspector.create({
            createInspectorSession: vi.fn()
        });

        expect(inspector._channel).toBeNull();
    });

    test("handles connection lifecycle, message dispatch, and reply failures", async () => {
        vi.useFakeTimers();

        const channel = {
            dispatchProtocolMessage: vi.fn(),
            dispose: vi.fn()
        };

        const isolate = {
            createInspectorSession: vi.fn(() => channel)
        };

        const sendReply = vi.fn();
        const inspector = new IsolateInspector(true, {
            sendReply,
            connectTimeout: 150
        });

        inspector.create(isolate);
        expect(inspector.getDebuggerCode("2 + 2")).toBe("debugger;\n2 + 2");
        expect(mocked.addDebuggerStmt).toHaveBeenCalledWith("2 + 2");

        channel.onResponse(null, "alpha");
        channel.onNotification("beta");

        expect(sendReply).toHaveBeenNthCalledWith(1, "alpha");
        expect(sendReply).toHaveBeenNthCalledWith(2, "beta");

        inspector.sendMessage(Buffer.from("gamma"));
        inspector.sendMessage("delta");
        expect(channel.dispatchProtocolMessage).toHaveBeenCalledWith("gamma");
        expect(channel.dispatchProtocolMessage).toHaveBeenCalledWith("delta");
        expect(() => inspector.sendMessage(5)).toThrow("Invalid message provided");

        inspector.onConnection();
        const pending = inspector.waitForConnection();
        await vi.advanceTimersByTimeAsync(100);
        await expect(pending).resolves.toBeUndefined();

        expect(inspector.connected).toBe(true);

        inspector.onDisconnect();
        expect(inspector.connected).toBe(false);
        expect(inspector._channel).toBeNull();

        const reconnect = new IsolateInspector(true, {
            sendReply
        });

        reconnect.isolate = isolate;
        reconnect.onConnection();

        expect(reconnect.connected).toBe(true);
        expect(isolate.createInspectorSession).toHaveBeenCalledTimes(2);

        const failing = new IsolateInspector(true, {
            sendReply: () => {
                throw new Error("reply failed");
            }
        });

        failing.create(isolate);
        failing._channel.onNotification("boom");

        expect(mocked.logger.error).toHaveBeenCalled();
        expect(failing._channel).toBeNull();

        const disposeError = new IsolateInspector(true, {
            sendReply
        });

        disposeError._channel = {
            dispose: () => {
                throw new Error("dispose failed");
            }
        };

        disposeError.dispose();
        expect(disposeError._channel).toBeNull();
    });
});
