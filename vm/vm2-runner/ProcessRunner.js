import { NodeVM } from "vm2";
import net from "net";
import crypto from "crypto";
import path from "path";

import VMUtil from "../../util/VMUtil.js";

const pendingFuncs = {};

function func_cb(socket, name, args) {
    return new Promise((resolve, reject) => {
        const uniqueName = name + "-" + crypto.randomBytes(5).toString("hex");

        VMUtil.sockWrite(socket, "funcCall", {
            funcCall: {
                name: name,
                uniqueName: uniqueName,
                args: args
            }
        });

        pendingFuncs[uniqueName] = resolve;
    });
}

function runScript(socket, script) {
    if(typeof script.funcs !== "undefined") {
        script.funcs.forEach(x => script.scope[x] = func_cb.bind(undefined, socket, x));
    }

    if(typeof script.additionalPath !== "undefined") {
        script.options.require.resolve = name => path.resolve(script.additionalPath, name);
    }

    const vm = new NodeVM({
        ...script.options,
        sandbox: script.scope
    });

    return vm.run(script.code, "ISOLATED_SCRIPT.js");
}

function listener(socket) {
    let buf = "";

    const recieve = async data => {
        buf += String(data);
                
        if(buf.endsWith("\n")) {
            let data;

            try {
                data = JSON.parse(buf);
                buf = "";
            } catch(err) {
                VMUtil.sockWrite(socket, {
                    error: {
                        name: err.constructor.name,
                        message: err.message,
                        stack: err.stack
                    }
                });

                socket.end();
            }

            switch(data.packetType) {
            case "script":
                try {
                    let res = await runScript(socket, data.script);

                    VMUtil.sockWrite(socket, "return", {
                        result: res
                    });
                } catch(err) {
                    VMUtil.sockWrite(socket, "return", {
                        error: {
                            name: err.constructor.name,
                            message: err.message,
                            stack: err.stack
                        }
                    });
                } finally {
                    socket.end();
                }

                break;
            case "funcReturn":
                pendingFuncs[data.funcReturn.uniqueName](data.funcReturn.data);
                delete pendingFuncs[data.funcReturn.uniqueName];

                break;
            }
        }
    }

    socket.on("data", recieve);
}

const socketName = crypto.randomBytes(20).toString("hex");

const server = net.createServer(listener);

server.on("listening", () => {
    console.log(`/tmp/vm2-${socketName}.sock`);
});

server.listen(`/tmp/vm2-${socketName}.sock`);