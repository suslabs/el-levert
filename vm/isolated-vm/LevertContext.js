import ivm from "isolated-vm";

import FakeMsg from "./FakeMsg.js";
import FakeUtil from "./FakeUtil.js";
import FakeAxios from "./FakeAxios.js";

const FuncTypes = {
    regular: "applySync",
    ignored: "applyIgnored",
    syncPromise: "applySyncPromise"
};

class LevertContext {
    constructor(isolate) {
        this.isolate = isolate;
    }

    async setMsg(msg) {
        const vmMsg = new ivm.ExternalCopy(msg.fixedMsg).copyInto();
        await this.global.set("msg", vmMsg);
    }

    async setArgs(args) {
        if(typeof args !== "undefined") {
            args = args.length > 0 ? args : undefined;

            const vmTag = new ivm.ExternalCopy({
                args: args
            }).copyInto();

            await this.global.set("tag", vmTag);
        }
    }

    registerFunc(options) {
        const {
            objName,
            funcName,
            type,
            funcRef
        } = options;

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

    async registerReply(msg) {
        await this.context.eval(`class ManevraError extends Error {
            constructor(message = "", ...args) {
                super(message, ...args);
                
                this.name = "ManevraError";
                this.message = message;
            }
        }`);

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
    }
    
    async setupContext(msg, args) {
        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        const global = this.context.global;
        await global.set("global", global.derefInto());
        this.global = global;

        msg = new FakeMsg(msg);
        
        await this.setMsg(msg);
        await this.setArgs(args);

        await this.registerFuncs(msg);
        await this.registerReply(msg);
    }

    async getContext(msg, args) {
        await this.setupContext(msg, args);
        return this.context;
    }
};

export default LevertContext;