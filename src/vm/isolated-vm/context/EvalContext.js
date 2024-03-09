import ivm from "isolated-vm";

import { getLogger } from "../../../LevertClient.js";

import FakeMsg from "../classes/FakeMsg.js";
import VMFunction from "../../../structures/vm/VMFunction.js";

import funcMap from "./funcMap.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

const filename = "script.js",
    inspectorUrl = "devtools://devtools/bundled/inspector.html?experiments=true&v8only=true";

class EvalContext {
    constructor(options) {
        this.memLimit = options.memLimit;
        this.timeLimit = options.timeLimit;

        this.enableInspector = options.enableInspector ?? false;
        this.inspectorPort = options.inspectorPort ?? 10000;
    }

    async setMsg(msg) {
        const vmMsg = new ivm.ExternalCopy(msg.fixedMsg).copyInto();

        await this.global.set(globalNames.msg, vmMsg);
    }

    async setArgs(args) {
        if (typeof args === "undefined") {
            return;
        }

        args = args.length > 0 ? args : undefined;

        const vmTag = new ivm.ExternalCopy({
            args: args
        }).copyInto();

        await this.global.set(globalNames.tag, vmTag);
    }

    registerFunc(func) {
        const code = func.getRegisterCode();

        return this.context.evalClosure(code, [func.ref], {
            arguments: {
                reference: true
            }
        });
    }

    async registerFuncs(objMap) {
        let funcs = [];

        for (const [objKey, funcMap] of Object.entries(objMap)) {
            const objName = globalNames[objKey],
                names = funcNames[objKey];

            for (let [funcKey, funcProperties] of Object.entries(funcMap)) {
                funcProperties = {
                    ...funcProperties,
                    parent: objName,
                    name: names[funcKey]
                };

                const func = new VMFunction(funcProperties, this.propertyMap);
                funcs.push(func);
            }
        }

        for (const func of funcs) {
            await this.registerFunc(func);
        }

        this.funcs = funcs;
    }

    async setupContext(msg, args) {
        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        const global = this.context.global;
        await global.set("global", global.derefInto());
        this.global = global;

        msg = new FakeMsg(msg);

        await this.setMsg(msg);
        await this.setArgs(args);

        this.propertyMap = {
            msg
        };

        await this.registerFuncs(funcMap);
    }

    setupDebugger() {
        let wss = new WebSocket.Server({
            port: this.inspectorPort
        });

        let handleConnection = function (ws) {
            if (typeof this.isolate === "undefined") {
                return;
            }

            let channel = this.isolate.createInspectorSession();

            function dispose() {
                try {
                    channel.dispose();
                } catch (err) {
                    getLogger().error(err.message);
                }
            }

            ws.on("error", err => {
                getLogger().error(err.message);
                dispose();
            });

            ws.on("close", (code, reason) => {
                getLogger().info(`Websocket closed: ${code}, ${reason}`);
                dispose();
            });

            ws.on("message", function (msg) {
                try {
                    const str = String(msg);
                    channel.dispatchProtocolMessage(str);
                } catch (err) {
                    getLogger().error("Error message to inspector", err);
                    ws.close();
                }
            });

            function send(message) {
                try {
                    ws.send(message);
                } catch (err) {
                    getLogger().error(err);
                    dispose();
                }
            }

            channel.onResponse = (callId, message) => send(message);
            channel.onNotification = send;
        };

        handleConnection = handleConnection.bind(this);
        wss.on("connection", handleConnection);

        this.wss = wss;
        getLogger().info("Inspector: " + inspectorUrl + `&ws=127.0.0.1:${this.inspectorPort}`);
    }

    async setupIsolate(msg, args) {
        this.isolate = new ivm.Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        await this.setupContext(msg, args);

        if (this.enableInspector) {
            this.setupDebugger();
        }
    }

    disposeIsolate() {
        this.script.release();
        this.context.release();

        if (!this.isolate.isDisposed) {
            this.isolate.dispose();
        }

        delete this.script;
        delete this.context;
        delete this.isolate;
    }

    async compileScript(code) {
        this.script = await this.isolate.compileScript(code, {
            filename: `file:///${filename}`
        });
    }

    async getIsolate(options) {
        const { code, msg, args } = options;

        await this.setupIsolate(msg, args);
        await this.compileScript(code);

        return this.isolate;
    }

    async runScript() {
        const res = await this.script.run(this.context, {
            timeout: this.timeLimit * 1000
        });

        return res;
    }
}

export default EvalContext;
