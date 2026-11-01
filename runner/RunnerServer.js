import GatewayServer from "@el-levert/common/gateway/GatewayServer.js";
import RPCChannel from "@el-levert/common/gateway/rpc/RPCChannel.js";

import EvalContext from "./vm/context/EvalContext.js";
import { initFakeAxios, resetFakeAxios } from "./vm/classes/FakeHttp.js";
import RunnerHandler from "./RunnerHandler.js";

import { getRunnerLogger } from "./logger/RunnerLogger.js";

import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";

class RunnerServer {
    static defaultHost = "127.0.0.1";
    static defaultPort = 9123;

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        const host = options.host ?? RunnerServer.defaultHost,
            port = options.port ?? RunnerServer.defaultPort;

        this.host = host;
        this.port = port;
        this.options = options;

        this.gateway = null;
        this.channels = new Set();
    }

    start() {
        if (this.gateway !== null) {
            return;
        }

        initFakeAxios(this.options.vmHttp ?? {});
        EvalContext.initFunctions();

        const gateway = new GatewayServer(this.host, this.port, {
            logger: getRunnerLogger()
        });

        gateway.on("connection", socket => {
            this._handleConnection(socket);
        });

        gateway.on("server_error", err => {
            getRunnerLogger().error("Gateway server error:", err);
        });

        gateway.start();
        this.gateway = gateway;

        getRunnerLogger().info(`VM Runner server listening on ${this.host}:${this.port}`);
    }

    stop() {
        if (this.gateway === null) {
            return;
        }

        getRunnerLogger().info("Stopping VM Runner server...");

        for (const rpc of this.channels) {
            rpc.destroy();
        }

        this.channels.clear();

        this.gateway.stop();
        this.gateway = null;

        resetFakeAxios();
    }

    _handleConnection(socket) {
        const rpc = new RPCChannel(socket),
            handler = new RunnerHandler(rpc, this.options);

        this.channels.add(rpc);

        rpc.register("runScript", (code, values, opts) => handler.runScript(code, values, opts));

        socket.on("close", () => {
            rpc.destroy();
            this.channels.delete(rpc);
        });
    }
}

export default RunnerServer;
