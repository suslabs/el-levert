import axios from "axios";
import { getClient } from "../LevertClient.js";

import VM2ProcPool from "./vm2-runner/VM2ProcPool.js";
import Util from "../util/Util.js";

class TagVM2 {
    constructor() {
        this.memLimit = getClient().config.otherMemLimit;
        this.timeLimit = getClient().config.otherTimeLimit;

        this.procPool = new VM2ProcPool({
            min: 1,
            max: 3,
            memory: this.memLimit,
            time: this.timeLimit * 1000
        });

        this.procPool.createPool();

        this.vmOptions = {
            allowAsync: true,
            wrapper: "none",
            console: "inherit",
            require: {
                external: ["three", "minimist-string", "three/*", "canvas.cjs"],
                builtin: ["assert", "buffer", "crypto", "events", "path", "querystring", "url", "util", "zlib"],
                root: "../../",
                mock: {
                    net: {},
                    os: {},          
                    child_process: {},
                    fs: {}
                }
            }
        }
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
            reply: function(reply, text, options) {
                let format = Util.formatReply(text, options);

                if(typeof format.file !== "undefined") {
                    format = {
                        ...format,
                        ...Util.getFileAttach(format.file.data, format.file.name)
                    }
                }

                reply.reply = format;
            }.bind(undefined, reply),
            findUsers: getClient().findUsers.bind(getClient()),
            dumpTags: getClient().tagManager.dump.bind(getClient().tagManager),
            fetchTag: async name => {
                let tag = await getClient().tagManager.fetch(name);
        
                if(!tag) {
                    return undefined;
                }
        
                if(tag.hops.length > 1) {
                    tag = await getClient().tagManager.fetchAlias(tag);
                }
        
                return tag;
            },
            request: async (...args) => {
                const res = await axios.request.apply(this, args);
                
                return {
                    data: res.data,
                    status: res.status,
                    statusText: res.statusText,
                    headers: res.headers
                };
            }
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