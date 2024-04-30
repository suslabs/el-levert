import { spawn } from "node:child_process";
import net from "node:net";
import crypto from "node:crypto";
import genericPool from "generic-pool";

import VMError from "../../../errors/VMError.js";

import VMUtil from "../../../util/vm/VMUtil.js";
import Util from "../../../util/Util.js";

function listener(socket, funcs) {
    return new Promise((resolve, reject) => {
        let buf = "";

        const recieve = async data => {
            buf += String(data);

            if (buf.endsWith("\n")) {
                let data;

                try {
                    data = JSON.parse(buf);
                    buf = "";
                } catch (err) {
                    reject(err.message);
                }

                if (typeof data === "undefined" || typeof data.packetType === "undefined") {
                    return;
                }

                await processPacket(socket, data, funcs, resolve, reject);
            }
        };

        socket.on("data", recieve);
        socket.on("close", _ => reject(new Error("Socket was cabaled")));
    });
}

async function processPacket(socket, data, funcs, resolve, reject) {
    switch (data.packetType) {
        case "return":
            resolve(data);

            break;
        case "funcCall":
            {
                let res;

                try {
                    res = await funcs[data.funcCall.name](data.funcCall.args);
                } catch (err) {
                    reject(err.message);
                }

                VMUtil.sockWrite(socket, "funcReturn", {
                    funcReturn: {
                        uniqueName: data.funcCall.uniqueName,
                        data: res
                    }
                });
            }

            break;
    }
}

class VM2ProcPool {
    constructor({ min, max, ...limits }) {
        limits = Object.assign(
            {
                cpu: 100,
                memory: 200,
                time: 4000
            },
            limits
        );

        this.limits = limits;
        this.limitError = null;

        this.dirname = "./src/vm/vm2/runner";
        this.runnerPath = "../runner/ScriptRunner.js";
    }

    createPool() {
        const ref = crypto.randomBytes(20).toString("hex"),
            kill = () => {
                spawn("sh", ["-c", `pkill -9 -f ${ref}`]);
            };

        const factory = {
            destroy: kill
        };

        let stderrCache = "";

        factory.create = function () {
            const runner = spawn("node", [this.runnerPath, ref], {
                cwd: this.dirname,
                shell: false
            });

            runner.stdout.on("data", data => {
                const str = data.toString().trim();

                if (!str.toLowerCase().includes("debugger") && typeof runner.socket === "undefined") {
                    runner.socket ??= str;
                }
            });

            runner.stderr.on("data", data => {
                stderrCache = stderrCache + data.toString();

                if (
                    stderrCache.includes(
                        "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"
                    )
                ) {
                    this.limitError = "Code execution exceeed allowed memory.";
                }
            });

            return runner;
        }.bind(this);

        const pool = genericPool.createPool(factory, {
            min: this.min,
            max: this.max
        });

        this.kill = kill;
        this.pool = pool;
    }

    async prepare_cp() {
        if (typeof this.childProcess !== "undefined") {
            this.pool.destroy(this.childProcess);
        }

        const childProcess = await this.pool.acquire();
        await Util.waitForCondition(() => childProcess.socket);

        this.childProcess = childProcess;
    }

    async run(code, scope, options, funcs, additionalPath) {
        if (typeof this.childProcess === "undefined") {
            await this.prepare_cp();
        }

        const socket = net.createConnection(this.childProcess.socket),
            timer = setTimeout(() => {
                this.limitError = "Code execution took too long and was killed.";
                this.kill();
            }, this.limits.time);

        VMUtil.sockWrite(socket, "script", {
            script: {
                code: code,
                scope: scope,
                options: options,
                funcs: Object.keys(funcs),
                additionalPath: additionalPath
            }
        });

        let data;

        try {
            data = await listener(socket, funcs);
        } catch (error) {
            const limit = this.limitError;
            this.limitError = null;

            if (limit !== null) {
                await this.prepare_cp();
            }

            throw new VMError(limit ?? error);
        } finally {
            clearTimeout(timer);
        }

        if (data.error) {
            const err = class extends Error {
                constructor(message, stack) {
                    super(message);

                    this.message = message;
                    this.stack = stack;
                }
            };

            Object.defineProperty(err, "name", {
                value: data.error.name
            });

            throw new err(data.error.message, data.error.stack);
        }

        return data.result;
    }
}

export default VM2ProcPool;
