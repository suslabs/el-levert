import { NodeVM } from "vm2";
import net, { SocketAddress } from "net";
import crypto from "crypto";

const pendingFuncs = {};

function sockWrite(socket, obj) {
    socket.write(JSON.stringify(obj) + "\n");
}

function func_cb(socket, name, args) {
    return new Promise((resolve, reject) => {
        sockWrite(socket, {
            funcCall: {
                name: name,
                args: args
            }
        });

        pendingFuncs[name] = resolve;
    });
}

function runScript(socket, code, scope, options, funcs) {
    funcs.forEach(x => scope[x] = func_cb.bind(undefined, socket, x));

    const vm = new NodeVM({
        ...options,
        sandbox: scope
    });

    return vm.run(code, "ISOLATED_SCRIPT.js");
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
                sockWrite(socket, {
                    error: {
                        name: err.constructor.name,
                        message: err.message,
                        stack: err.stack
                    }
                });

                socket.end();
            }

            if(typeof data.script !== "undefined") {
                const { code, scope, options, funcs } = data.script;

                try {
                    const res = (await runScript(socket, code, scope, options, funcs)) ?? null;

                    sockWrite(socket, {
                        result: res
                    });
                } catch(err) {
                    sockWrite(socket, {
                        error: {
                            name: err.constructor.name,
                            message: err.message,
                            stack: err.stack
                        }
                    });
                } finally {
                    socket.end();
                }
            } else if(typeof data.funcReturn !== "undefined") {
                pendingFuncs[data.funcReturn.name](data.funcReturn.data);
                delete pendingFuncs[data.funcReturn.name];
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