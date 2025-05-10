import VM from "../VM.js";

import VM2ProcPool from "./process-pool/ProcessPool.js";

import FakeUtil from "./classes/FakeUtil.js";
import FakeAxios from "./classes/FakeAxios.js";

import { getClient, getLogger } from "../../LevertClient.js";

import Util from "../../util/Util.js";
import VMUtil from "../../util/vm/VMUtil.js";

const defaultVMOptions = {
    allowAsync: true,
    wrapper: "none",
    console: "inherit",
    require: {
        builtin: ["assert", "buffer", "crypto", "events", "path", "querystring", "url", "util", "zlib"],
        root: "../../",
        mock: {
            net: {},
            os: {},
            child_process: {},
            fs: {}
        }
    }
};

const additionalPath = "";

function formatCode(code) {
    code = `return (async () => {${code};})();`;
    return code;
}

class TagVM2 extends VM {
    static $name = "tagVM2";
    static loadPriority = 2;

    constructor(enabled, options = {}) {
        super(enabled, options);

        this.vmOptions = options.vmOptions ?? defaultVMOptions;

        this.memLimit = getClient().config.otherMemLimit;
        this.timeLimit = getClient().config.otherTimeLimit;
    }

    createProcPool() {
        this.procPool = new VM2ProcPool({
            min: 1,
            max: 3,
            memory: this.memLimit,
            time: this.timeLimit
        });

        this.procPool.createPool();
    }

    getContext(values = {}) {
        const { msg, args } = values;

        const vmObjects = {
            msg
        };

        if (typeof args !== "undefined") {
            vmObjects.tag = {
                args: Util.empty(args) ? undefined : args
            };
        }

        const outputVars = {
            reply: {}
        };

        const vmFuncs = {
            reply: FakeUtil.reply.bind(outputVars.reply),
            findUsers: FakeUtil.findUsers,
            dumpTags: FakeUtil.dumpTags,
            fetchTag: FakeUtil.fetchTag,
            request: FakeAxios.request
        };

        return { vmObjects, vmFuncs, outputVars };
    }

    handleError(err) {
        switch (err.message) {
            case "Code execution took too long and was killed.":
            case "Code execution exceeed allowed memory.":
                return ":no_entry_sign: " + err.message;
            default:
                throw err;
        }
    }

    async runScript(code, values) {
        const { vmObjects, vmFuncs, outputVars } = this.getContext(values),
            formattedCode = formatCode(code);

        let out;

        try {
            out = await this.procPool.run(formattedCode, vmObjects, this.vmOptions, vmFuncs, additionalPath);

            if (typeof outputVars.reply.reply !== "undefined") {
                out = outputVars.reply.reply;
            } else {
                out = VMUtil.formatOutput(out);
            }
        } catch (err) {
            out = this.handleError(err);
        }

        return out;
    }

    kill() {
        try {
            this.procPool.kill();
        } catch (err) {
            getLogger().error(err);
            return false;
        }

        return true;
    }

    load() {
        this.createProcPool();
    }

    unload() {
        const killed = this.kill();

        if (killed) {
            getLogger().info("Killed VM2 child process.");
        }

        return killed;
    }

    getDisabledMessage() {
        return "VM2 is disabled";
    }
}

export default TagVM2;
