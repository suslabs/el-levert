import ivm from "isolated-vm";

import { getLogger } from "../../LevertClient.js";

import FakeMsg from "./FakeMsg.js";
import FakeUtil from "./FakeUtil.js";
import FakeAxios from "./FakeAxios.js";

const FuncTypes = {
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
};

const filename = "script.js",
    inspectorUrl = "devtools://devtools/bundled/inspector.html?experiments=true&v8only=true";

class LevertContext {
    constructor(options) {
        this.memLimit = options.memLimit;
        this.timeLimit = options.timeLimit;

        this.enableInspector = options.enableInspector;
        this.inspectorPort = options.inspectorPort;
    }

    async setMsg(msg) {
        const vmMsg = new ivm.ExternalCopy(msg.fixedMsg).copyInto();
        await this.global.set("msg", vmMsg);
    }

    async setArgs(args) {
        if (typeof args !== "undefined") {
            args = args.length > 0 ? args : undefined;

            const vmTag = new ivm.ExternalCopy({
                args: args
            }).copyInto();

            await this.global.set("tag", vmTag);
        }
    }

    registerFunc(options) {
        const { objName, funcName, type, funcRef } = options;

        const body =
                options.body ??
                `return $0.${type}(undefined, args, {
            arguments: {
                copy: true
            }
        });`,
            code = `(function() {
    if(typeof ${objName} === "undefined") {
        ${objName} = {};
    }

    ${objName}.${funcName} = (...args) => {
        ${body}
    }
})();`;

        return this.context.evalClosure(code, [funcRef], {
            arguments: {
                reference: true
            }
        });
    }

    async registerReply(msg) {
        await this.context.eval(`class ManevraError extends Error {
            constructor(message = "", ...args) {
                super(message, ...args);
                
                this.name = "ManevraError";
                this.message = message;
            }
        }`);

        await this.registerFunc({
            objName: "msg",
            funcName: "reply",
            funcRef: msg.reply,
            body: `
        const ret = $0.applySync(undefined, args, {
            arguments: {
                copy: true
            }
        });

        throw new ManevraError(ret);
`
        });
    }

    async registerFuncs(msg) {
        await this.registerFunc({
            objName: "util",
            funcName: "findUsers",
            type: FuncTypes.syncPromise,
            funcRef: FakeUtil.findUsers
        });

        await this.registerFunc({
            objName: "util",
            funcName: "dumpTags",
            type: FuncTypes.syncPromise,
            funcRef: FakeUtil.dumpTags
        });

        await this.registerFunc({
            objName: "util",
            funcName: "fetchTag",
            type: FuncTypes.syncPromise,
            funcRef: FakeUtil.fetchTag
        });

        await this.registerFunc({
            objName: "util",
            funcName: "fetchMessage",
            type: FuncTypes.syncPromise,
            funcRef: FakeUtil.fetchMessage.bind(undefined, msg.msg.author.id)
        });

        await this.registerFunc({
            objName: "util",
            funcName: "fetchMessages",
            type: FuncTypes.syncPromise,
            funcRef: FakeUtil.fetchMessages.bind(undefined, msg.msg.author.id)
        });

        await this.registerFunc({
            objName: "http",
            funcName: "request",
            type: FuncTypes.syncPromise,
            funcRef: FakeAxios.request
        });
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

        await this.registerFuncs(msg);
        await this.registerReply(msg);
    }

    async getContext(msg, args) {
        await this.setupContext(msg, args);
        return this.context;
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

        if (!isolate.isDisposed) {
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

export default LevertContext;
