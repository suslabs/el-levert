import { getClient } from "../../LevertClient.js";

import EvalContext from "./context/EvalContext.js";
import InspectorServer from "./inspector/InspectorServer.js";

import VMErrors from "./VMErrors.js";

import Util from "../../util/Util.js";

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.outCharLimit = getClient().config.outCharLimit;
        this.outNewlineLimit = getClient().config.outNewlineLimit;
    }

    setupInspectorServer() {
        const enableInspector = getClient().config.enableInspector,
            inspectorPort = getClient().config.inspectorPort;

        const inspectorServer = new InspectorServer(enableInspector, inspectorPort);
        inspectorServer.setup();

        this.inspectorServer = inspectorServer;
    }

    handleError(err) {
        switch (err.name) {
            case "ExitError":
                return err.exitData;
            case "ManevraError":
                return this.processReply(err.message);
        }

        switch (err.message) {
            case VMErrors.timeout:
                return ":no_entry_sign: " + err.message;
            case VMErrors.memLimit:
                return ":no_entry_sign: Memory limit reached.";
            default:
                throw err;
        }
    }

    processReply(msg) {
        let out = JSON.parse(msg);

        if (typeof out.content !== "undefined") {
            let split = out.content.split("\n");

            if (out.content.length > this.outCharLimit || split.length > this.outNewlineLimit) {
                return Util.getFileAttach(out.content);
            }
        }

        if (typeof out.file !== "undefined") {
            if (typeof out.file.data === "object") {
                out.file.data = Object.values(out.file.data);
            }

            delete out.file;

            out = {
                ...out,
                ...Util.getFileAttach(out.file.data, out.file.name)
            };
        }

        return out;
    }

    async runScript(code, msg, args) {
        const context = new EvalContext(
            {
                memLimit: this.memLimit,
                timeLimit: this.timeLimit
            },
            {
                enable: this.inspectorServer?.enable,
                sendReply: this.inspectorServer?.sendReply
            }
        );

        await context.getIsolate({ msg, args });
        this.inspectorServer?.setContext(context);

        let res;

        try {
            res = await context.runScript(code);

            if (typeof res === "number") {
                res = res.toString();
            }
        } catch (err) {
            res = this.handleError(err);
        } finally {
            this.inspectorServer?.executionFinished();
            context.disposeIsolate();
        }

        return res;
    }

    unload() {
        this.inspectorServer?.close();
    }
}

export default TagVM;
