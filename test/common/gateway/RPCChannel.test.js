import { EventEmitter } from "node:events";

import { describe, expect, test } from "vitest";

import RPCChannel from "@el-levert/common/gateway/rpc/RPCChannel.js";

import Util from "@el-levert/common/util/Util.js";

import VMError from "@el-levert/common/errors/VMError.js";

function createMockSocketPair() {
    const emitterA = new EventEmitter(),
        emitterB = new EventEmitter();

    const socketA = {
        on: emitterA.on.bind(emitterA),
        off: emitterA.off.bind(emitterA),
        removeListener: emitterA.removeListener.bind(emitterA),
        send: data => {
            setImmediate(() => emitterB.emit("message", Buffer.from(data), false));
        }
    };

    const socketB = {
        on: emitterB.on.bind(emitterB),
        off: emitterB.off.bind(emitterB),
        removeListener: emitterB.removeListener.bind(emitterB),
        send: data => {
            setImmediate(() => emitterA.emit("message", Buffer.from(data), false));
        }
    };

    return [socketA, socketB];
}

describe("RPCChannel", () => {
    test("calls registered method and returns result", async () => {
        const [socketA, socketB] = createMockSocketPair();

        const channelA = new RPCChannel(socketA),
            channelB = new RPCChannel(socketB);

        channelB.register("add", (a, b) => a + b);

        const result = await channelA.call("add", 5, 7);
        expect(result).toBe(12);

        channelA.destroy();
        channelB.destroy();
    });

    test("propagates handler error as VMError", async () => {
        const [socketA, socketB] = createMockSocketPair();

        const channelA = new RPCChannel(socketA),
            channelB = new RPCChannel(socketB);

        channelB.register("fail", () => {
            throw new VMError("Deliberate failure");
        });

        await expect(channelA.call("fail")).rejects.toThrow("Deliberate failure");

        channelA.destroy();
        channelB.destroy();
    });

    test("handles unknown method error", async () => {
        const [socketA, socketB] = createMockSocketPair();

        const channelA = new RPCChannel(socketA),
            channelB = new RPCChannel(socketB);

        await expect(channelA.call("nonexistent")).rejects.toThrow("Unknown RPC method: nonexistent");

        channelA.destroy();
        channelB.destroy();
    });

    test("handles call timeout", async () => {
        const [socketA, socketB] = createMockSocketPair();

        const timeout = 0.05 / Util.durationSeconds.milli;

        const channelA = new RPCChannel(socketA, { timeout }),
            channelB = new RPCChannel(socketB);

        channelB.register("slow", () => new Promise(resolve => setTimeout(resolve, 0.2 / Util.durationSeconds.milli)));

        await expect(channelA.call("slow")).rejects.toThrow('RPC call "slow" timed out');

        channelA.destroy();
        channelB.destroy();
    });
});