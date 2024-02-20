import { getClient } from "../../LevertClient.js";

import LevertContext from "./LevertContext.js";
import Util from "../../util/Util.js";

function processReply(msg) {
    const client = getClient();
    let out = JSON.parse(msg);

    if (typeof out.content !== "undefined") {
        const split = out.content.split("\n");

        if (out.content.length > client.config.outCharLimit || split.length > client.config.outNewlineLimit) {
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

const Errors = {
    timeout: "Script execution timed out.",
    memLimit: "Isolate was disposed during execution due to memory limit"
};

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;

        this.enableInspector = getClient().config.enableInspector;
        this.inspectorPort = getClient().config.inspectorPort;
    }

    async runScript(code, msg, args) {
        const context = new LevertContext({
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
            if (err.name === "ManevraError") {
                res = processReply(err.message);
            } else {
                switch (err.message) {
                    case Errors.timeout:
                        res = ":no_entry_sign: " + err.message;
                        break;
                    case Errors.memLimit:
                        res = ":no_entry_sign: Memory limit reached.";
                        break;
                    default:
                        throw err;
                }
            }
        } finally {
            context.disposeIsolate();
        }

        return res;
    }
}

export default TagVM;
