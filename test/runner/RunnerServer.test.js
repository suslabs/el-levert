import { afterAll, beforeAll, describe, expect, test } from "vitest";

import RunnerServer from "@el-levert/runner/RunnerServer.js";
import GatewayClient from "@el-levert/common/gateway/GatewayClient.js";
import RPCChannel from "@el-levert/common/gateway/rpc/RPCChannel.js";

import Util from "@el-levert/common/util/Util.js";

describe("RunnerServer", () => {
    const port = 9876,
        host = "127.0.0.1";

    let server, client, rpc;

    beforeAll(async () => {
        server = new RunnerServer({ port, host });
        server.start();

        client = new GatewayClient(`ws://${host}:${port}`, { reconnect: false });

        await new Promise(resolve => {
            client.on("open", socket => {
                rpc = new RPCChannel(socket);
                resolve();
            });

            client.connect();
        });
    });

    afterAll(() => {
        rpc?.destroy();
        client?.disconnect();
        server?.stop();
    });

    test("executes simple script over RPC", async () => {
        const [out, dataType] = await rpc.call("runScript", "1 + 1", {}, {});

        expect(out).toBe("2");
        expect(dataType).toBe("script");
    });

    test("handles script error over RPC", async () => {
        await expect(rpc.call("runScript", "throw new Error('test failure')", {}, {})).rejects.toThrow("test failure");
    });
});
