import ivm from "isolated-vm";
import WebSocket from "ws";

import { getClient, getLogger } from "../../LevertClient.js";

import LevertContext from "./LevertContext.js";
import Util from "../../util/Util.js";

function parseReply(msg) {
    const client = getClient();
    let out = JSON.parse(msg);

    const split = out.content.split("\n");
    if(out.content.length > client.config.outCharLimit ||
       split.length > client.config.outNewlineLimit) {
        return Util.getFileAttach(out.content);
    }
    
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

    async setupIsolate(code, msg, args) {
        this.isolate = new ivm.Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        this.script = await this.isolate.compileScript(code, {
            filename: `file:///${filename}`
        });

        const levertContext = new LevertContext(this.isolate);
        this.context = await levertContext.getContext(msg, args);
    }

    disposeIsolate() {
        this.isolate.dispose();
        this.isolate = undefined;
    }

    async runScript(code, msg, args) {
        await this.setupIsolate(code, msg, args);
        let res;
             
        try {
            res = await this.script.run(this.context, {
                timeout: this.timeLimit * 1000
            });

            if(typeof res === "number") {
                res = res.toString();
            }
        } catch(err) {
            if(err.name === "ManevraError") {
                res = parseReply(err.message);
            }

            switch(err.message) {
            case "Script execution timed out.":
                res = ":no_entry_sign: " + err.message;
                break;
            case "Isolate was disposed during execution due to memory limit":
                res = ":no_entry_sign: Memory limit reached.";
                break;
            }

            throw err;
        } finally {
            this.disposeIsolate();
            return res;
        }
    }
}

export default TagVM;