import { getClient } from "../../LevertClient.js";

import VM2ProcPool from "./process-pool/ProcessPool.js";
import FakeUtil from "./FakeUtil.js";
import FakeAxios from "./FakeAxios.js";

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

class TagVM2 {
    constructor() {
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

    async runScript(code, msg, args) {
        const vmObjects = {
            msg: msg
        };

        if(typeof args !== "undefined") {
            vmObjects.tag = {
                args: args.length > 0 ? args : undefined
            };
        }

        let reply = {};
        const vmFuncs = {
            reply: FakeUtil.reply.bind(reply),
            findUsers: FakeUtil.findUsers,
            dumpTags: FakeUtil.dumpTags,
            fetchTag: FakeUtil.fetchTag,
            request: FakeAxios.request
        };

        code = `return (async () => {${code};})();`;

        try {
            const out = await this.procPool.run(code, vmObjects, this.vmOptions, vmFuncs, "../canvas-integration");

            if(typeof reply.reply !== "undefined") {
                return reply.reply;
            }

            if(typeof out === "number") {
                return out.toString();
            }
    
            return out;
        } catch(err) {
            switch(err.message) {
            case "Code execution took too long and was killed.":
            case "Code execution exceeed allowed memory.":
                return ":no_entry_sign: " + err.message;
            }

            throw err;
        }
        
    }
}

export default TagVM2;