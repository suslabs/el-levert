import { fork } from "node:child_process";
import net from "node:net";
import path from "node:path";

import { getLogger } from "../../LevertClient.js";

import Util from "@el-levert/common/util/Util.js";
import ObjectUtil from "@el-levert/common/util/ObjectUtil.js";

import VMError from "@el-levert/common/errors/VMError.js";

class RunnerProcess {
    static checkInterval = 0.1 / Util.durationSeconds.milli;
    static defaultStartupTimeout = 5 / Util.durationSeconds.milli;

    constructor(options) {
        options = ObjectUtil.guaranteeObject(options);

        const port = options.port ?? 9123,
            host = options.host ?? "127.0.0.1";

        const startupTimeout = options.startupTimeout ?? this.constructor.defaultStartupTimeout;

        this.port = port;
        this.host = host;
        this.startupTimeout = startupTimeout;

        this.process = null;
        this._stopping = false;
    }

    get isRunning() {
        return this.process !== null && !this.process.killed;
    }

    async start() {
        const isUp = await this._isPortOpen();

        if (isUp) {
            getLogger().info(`VM runner is already running on ${this.host}:${this.port}`);
            return;
        }

        getLogger().info(`Starting local VM runner process on ${this.host}:${this.port}...`);

        const runnerPath = path.resolve(globalThis.projRoot, "runner/index.js");

        const env = {
            ...process.env,
            RUNNER_PORT: String(this.port),
            RUNNER_HOST: this.host
        };

        this._stopping = false;

        this.process = fork(runnerPath, [], {
            stdio: "inherit",
            env
        });

        this._bindProcessEvents();
        await this._waitForStartup();

        getLogger().info("Local VM runner process started successfully.");
    }

    async stop() {
        if (this.process === null) {
            return;
        }

        this._stopping = true;
        getLogger().info("Stopping local VM runner process...");

        const proc = this.process;
        this.process = null;

        await new Promise(resolve => {
            const timer = setTimeout(
                () => {
                    try {
                        proc.kill("SIGKILL");
                    } catch {}

                    resolve();
                },
                (1 * Util.durationSeconds.second) / Util.durationSeconds.milli
            );

            proc.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });

            try {
                proc.kill("SIGTERM");
            } catch {
                clearTimeout(timer);
                resolve();
            }
        });

        await new Promise(resolve => {
            const timer = setTimeout(() => {
                try {
                    proc.kill("SIGKILL");
                } catch {}

                resolve();
            }, (1 * Util.durationSeconds.second) / Util.durationSeconds.milli);

            proc.once("exit", () => {
                clearTimeout(timer);
                resolve();
            });

            try {
                proc.kill("SIGTERM");
            } catch {
                clearTimeout(timer);
                resolve();
            }
        });
    }

    _bindProcessEvents() {
        this.process.on("exit", (code, signal) => {
            const wasClean = this._stopping;
            this.process = null;

            if (!wasClean) {
                getLogger().error(`VM runner process crashed (code: ${code}, signal: ${signal})`);
            }
        });

        process.once("exit", () => this.stop());
    }

    _isPortOpen() {
        return new Promise(resolve => {
            const socket = net.createConnection({
                port: this.port,
                host: this.host
            });

            socket.once("connect", () => {
                socket.end();
                resolve(true);
            });

            socket.once("error", () => {
                socket.destroy();
                resolve(false);
            });
        });
    }

    async _waitForStartup() {
        await Util.waitForCondition(
            () => this._isPortOpen(),
            new VMError("Local VM runner failed to start within timeout"),
            this.startupTimeout,
            this.constructor.checkInterval
        );
    }
}

export default RunnerProcess;
