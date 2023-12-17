import ivm from "isolated-vm";
import WebSocket from "ws";

import { getClient, getLogger } from "../../LevertClient.js";

import FakeAxios from "../FakeAxios.js";
import FakeMsg from "../FakeMsg.js";
import FakeUtil from "../FakeUtil.js";

import Util from "../../util/Util.js";

function parseReply(msg) {
    let out = JSON.parse(msg);
    
    if(typeof out.file !== "undefined") {
        out.file.data = Object.values(out.file.data);

        out = {
            ...out,
            ...Util.getFileAttach(out.file.data, out.file.name)
        }
    }

    delete out.file;
    return out;
}

const FuncTypes = {
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
};

const filename = "script.js",
      inspectorUrl = "devtools://devtools/bundled/inspector.html?experiments=true&v8only=true";

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.enableInspector = getClient().config.enableInspector;
        this.inspectorPort = getClient().config.inspectorPort;

        if(this.enableInspector) {
            this.setupDebugger(this.isolate);
        }
    }

    registerFunc(options) {
        const objName = options.objName,
              funcName = options.funcName,
              type = options.type,
              funcRef = options.funcRef;

        const body = options.body ?? `return $0.${type}(undefined, args, {
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
    
    async setupContext(msg, args) {
        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        const global = this.context.global;
        await global.set("global", global.derefInto());

        msg = new FakeMsg(msg);
        await global.set("msg", new ivm.ExternalCopy(msg.fixedMsg).copyInto());

        if(typeof args !== "undefined") {
            args = args.length > 0 ? args : undefined;

            await global.set("tag", new ivm.ExternalCopy({
                args: args
            }).copyInto());
        }

        await this.context.eval(`class ManevraError extends Error {
    constructor(message = "", ...args) {
        super(message, ...args);
        
        this.name = "ManevraError";
        this.message = message;
    }
}`);

        await this.registerFuncs(msg);
    }

    setupDebugger() {
        let wss = new WebSocket.Server({
            port: this.inspectorPort
        });

        let handleConnection = function(ws) {
            if(typeof this.isolate === "undefined") {
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

            ws.on("error", (err) => {
                getLogger().error(err.message);
                dispose();
            });

            ws.on("close", (code, reason) => {
                getLogger().info(`Websocket closed: ${code}, ${reason}`);
                dispose();
            });

            ws.on("message", function(msg) {
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
        }

        handleConnection = handleConnection.bind(this);
        wss.on("connection", handleConnection);

        this.wss = wss;
        getLogger().info("Inspector: " + inspectorUrl + `&ws=127.0.0.1:${this.inspectorPort}`);
    }

    async runScript(code, msg, args) {
        this.isolate = new ivm.Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        const script = await this.isolate.compileScript(code, {
            filename: `file:///${filename}`
        });

        await this.setupContext(msg, args);
             
        try {
            const res = await script.run(this.context, {
                timeout: this.timeLimit * 1000
            });

            this.isolate.dispose();
            this.isolate = undefined;
            
            if(typeof res === "number") {
                return res.toString();
            }

            return res;
        } catch(err) {
            this.isolate.dispose();
            this.isolate = undefined;

            if(err.name === "ManevraError") {
                return parseReply(err.message);
            }

            switch(err.message) {
            case "Script execution timed out.":
                return ":no_entry_sign: " + err.message;
            case "Isolate was disposed during execution due to memory limit":
                return ":no_entry_sign: Memory limit reached.";
            }

            throw err;
        }
    }
}

export default TagVM;