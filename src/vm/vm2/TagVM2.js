import { getClient, getLogger } from "../../LevertClient.js";

import VM2ProcPool from "./process-pool/ProcessPool.js";
import FakeUtil from "./classes/FakeUtil.js";
import FakeAxios from "./classes/FakeAxios.js";

const vmOptions = {
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

const additionalPath = "../canvas-integration";

function formatCode(code) {
    code = `return (async () => {${code};})();`;
    return code;
}

class TagVM2 {
    constructor() {
        this.enabled = getClient().config.enableVM2;

        this.memLimit = getClient().config.otherMemLimit;
        this.timeLimit = getClient().config.otherTimeLimit;

        this.createProcPool();

        this.vmOptions = vmOptions;
    }

    createProcPool() {
        this.procPool = new VM2ProcPool({
            min: 1,
            max: 3,
            memory: this.memLimit,
            time: this.timeLimit * 1000
        });

        this.procPool.createPool();
    }

    getContext(msg, args) {
        const vmObjects = {
            msg: msg
        };

        if (typeof args !== "undefined") {
            vmObjects.tag = {
                args: args.length > 0 ? args : undefined
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

    async runScript(code, msg, args) {
        if (!this.enabled) {
            return "VM2 is disabled.";
        }

        const { vmObjects, vmFuncs, outputVars } = this.getContext(msg, args);
        code = formatCode(code);

        try {
            const out = await this.procPool.run(code, vmObjects, this.vmOptions, vmFuncs, additionalPath);

            if (typeof outputVars.reply.reply !== "undefined") {
                return outputVars.reply.reply;
            }

            if (typeof out === "number") {
                return out.toString();
            }

            return out;
        } catch (err) {
            switch (err.message) {
                case "Code execution took too long and was killed.":
                case "Code execution exceeed allowed memory.":
                    return ":no_entry_sign: " + err.message;
            }

            throw err;
        }
    }

    kill() {
        if (!this.enabled) {
            return true;
        }

        try {
            this.procPool.kill();
        } catch (err) {
            getLogger().error(err);
            return false;
        }

        return true;
    }
}

export default TagVM2;
