import { spawn } from "child_process";
import net from "net";
import crypto from "crypto";
import genericPool from "generic-pool";
import waitUntil from "./waitUntil.js";

function sockWrite(socket, obj) {
    socket.write(JSON.stringify(obj) + "\n");
}

class VM2ProcPool {
    constructor({ min, max, ...limits }) {
        limits.cpu = limits.cpu || 100;
        limits.memory = limits.memory || 2000;
        limits.time = limits.time || 4000;

        this.limits = limits;
        this.limitError = null;

        this.dirname = "./vm/vm2-runner";
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

        factory.create = function() {
            const runner = spawn("cpulimit", [
                "-ql",
                this.limits.cpu,
                "--",
                "node",
                `--max-old-space-size=${this.limits.memory}`,
                "ProcessRunner.js",
                ref
            ], {
                cwd: this.dirname,
                shell: false
            });

            runner.stdout.on("data", (data) => {
                runner.socket = runner.socket || data.toString().trim();
            });

            runner.stderr.on("data", (data) => {
                stderrCache = stderrCache + data.toString();
                
                if(stderrCache.includes("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory")) {
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

    listen(socket, funcs) {
        return new Promise((resolve, reject) => {
            let buf = "";

            const recieve = async data => {
                buf += String(data);
                
                if(buf.endsWith("\n")) {
                    let data;

                    try {
                        data = JSON.parse(buf);
                    } catch(err) {
                        reject(err.message);
                    }

                    if(typeof data.result !== "undefined" || typeof data.error !== "undefined") {
                        resolve(data);
                    } else if(typeof data.funcCall !== "undefined") {
                        let res;

                        try {
                            res = await funcs[data.funcCall.name](data.funcCall.args);
                        } catch(err) {
                            reject(err.message);
                        }

                        sockWrite(socket, {
                            funcReturn: {
                                name: data.funcCall.name,
                                data: res
                            }
                        });
                    }

                    buf = "";
                }
            };

            socket.on("data", recieve);
            socket.on("close", _ => reject(new Error("Socket was cabaled.")));
        });
    }

    async run(code, scope, options, funcs) {
        const childProcess = await this.pool.acquire();
        await waitUntil(() => childProcess.socket);

        const socket = net.createConnection(childProcess.socket),
              timer = setTimeout(() => {
            this.limitError = "Code execution took too long and was killed.";
            this.kill();
        }, this.limits.time);

        sockWrite(socket, {
            script: {
                code: code,
                scope: scope,
                options: options,
                funcs: Object.keys(funcs)
            }
        });

        let data;

        try {
            data = await this.listen(socket, funcs);
        } catch (error) {
            const limit = this.limitError;
            this.limitError = null;

            throw new Error(limit || error);
        } finally {
            clearTimeout(timer);
            this.pool.destroy(childProcess);
        }
        
        if(data.error) {
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