import ivm from "isolated-vm";
import Util from "../util/Util.js";

import { getClient } from "../LevertClient.js";

import FakeAxios from "./FakeAxios.js";
import FakeMsg from "./FakeMsg.js";
import FakeUtil from "./FakeUtil.js";

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

class TagVM {
    constructor() {
        this.memLimit = getClient().config.memLimit;
        this.timeLimit = getClient().config.timeLimit;
    }

    registerFunc(options) {
        const objName = options.objName,
              funcName = options.funcName,
              type = options.type,
              funcRef = options.funcRef;

        const body = options.body || `return $0.${type}(undefined, args, {
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
        this.context = await this.isolate.createContext();
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

    async runScript(code, msg, args) {
        this.isolate = new ivm.Isolate({
            memoryLimit: this.memLimit
        });

        const script = await this.isolate.compileScript(code);
        await this.setupContext(msg, args);
             
        try {
            const res = await script.run(this.context, {
                timeout: this.timeLimit * 1000
            });
            
            if(typeof res === "number") {
                return res.toString();
            }

            return res;
        } catch(err) {
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