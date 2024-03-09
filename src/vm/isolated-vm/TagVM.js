import { getClient } from "../../LevertClient.js";

import EvalContext from "./context/EvalContext.js";
import VMErrors from "./VMErrors.js";

import Util from "../../util/Util.js";

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.enableInspector = getClient().config.enableInspector;
        this.inspectorPort = getClient().config.inspectorPort;

        this.outCharLimit = getClient().config.outCharLimit;
        this.outNewlineLimit = getClient().config.outNewlineLimit;
    }

    async runScript(code, msg, args) {
        const context = new EvalContext({
            memLimit: this.memLimit,
            timeLimit: this.timeLimit,
            enableInspector: this.enableInspector,
            inspectorPort: this.inspectorPort
        });

        await context.getIsolate({ code, msg, args });
        let res;

        try {
            res = await context.runScript();

            if (typeof res === "number") {
                res = res.toString();
            }
        } catch (err) {
            res = this.handleError(err);
        } finally {
            context.disposeIsolate();
        }

        return res;
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
            const split = out.content.split("\n");

            if (out.content.length > this.outCharLimit || split.length > this.outNewlineLimit) {
                return Util.getFileAttach(out.content);
            }
        }

        if (typeof out.file !== "undefined") {
            if (typeof out.file.data === "object") {
                out.file.data = Object.values(out.file.data);
            }

            out = {
                ...out,
                ...Util.getFileAttach(out.file.data, out.file.name)
            };
        }

        delete out.file;
        return out;
    }
}

export default TagVM;
