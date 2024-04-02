import ivm from "isolated-vm";
const { Isolate, ExternalCopy } = ivm;

import FakeMsg from "../classes/FakeMsg.js";
import VMFunction from "../../../structures/vm/VMFunction.js";

import IsolateInspector from "../inspector/IsolateInspector.js";

import Functions from "./Functions.js";
import globalNames from "./globalNames.json" assert { type: "json" };
import funcNames from "./funcNames.json" assert { type: "json" };

const filename = "script.js";

class EvalContext {
    constructor(options, inspectorOptions = {}) {
        this.memLimit = options.memLimit;
        this.timeLimit = options.timeLimit;

        this.setupInspector(inspectorOptions);
    }

    setupInspector(options) {
        const enableInspector = options.enable ?? false;

        this.inspector = new IsolateInspector(enableInspector, options);
        this.enableInspector = enableInspector;
    }

    async setGlobal() {
        const global = this.context.global;

        this.global = global;
        await global.set("global", global.derefInto());
    }

    async setArgs(args) {
        if (args === null || args?.length < 1) {
            args = undefined;
        }

        this.args = args;

        const vmTag = new ExternalCopy({
            args: args
        }).copyInto();

        this.vmTag = vmTag;
        await this.global.set(globalNames.tag, vmTag);
    }

    async setMsg(msg) {
        const fakeMsg = new FakeMsg(msg);
        this.msg = fakeMsg;

        const vmMsg = new ExternalCopy(fakeMsg.fixedMsg).copyInto();

        this.vmMsg = vmMsg;
        await this.global.set(globalNames.msg, vmMsg);
    }

    constructFuncs(objMap, names) {
        let funcs = [];

        for (const [objKey, funcMap] of Object.entries(objMap)) {
            const objName = names.global[objKey],
                funcNames = names.func[objKey];

            for (let [funcKey, funcProperties] of Object.entries(funcMap)) {
                funcProperties = {
                    ...funcProperties,
                    parent: objName,
                    name: funcNames[funcKey]
                };

                const func = new VMFunction(funcProperties, this.propertyMap);
                funcs.push(func);
            }
        }

        return funcs;
    }

    registerFunc(func) {
        const code = func.getRegisterCode();

        return this.context.evalClosure(code, [func.ref], {
            arguments: {
                reference: true
            }
        });
    }

    async registerFuncs() {
        this.funcs = this.constructFuncs(Functions, {
            global: globalNames,
            func: funcNames
        });

        for (const func of this.funcs) {
            await this.registerFunc(func);
        }
    }

    async setupContext(msg, args) {
        this.context = await this.isolate.createContext({
            inspector: this.enableInspector
        });

        await this.setGlobal();

        await this.setMsg(msg);
        await this.setArgs(args);

        this.propertyMap = {
            msg
        };

        await this.registerFuncs();
    }

    async setupIsolate(msg, args) {
        this.isolate = new Isolate({
            memoryLimit: this.memLimit,
            inspector: this.enableInspector
        });

        await this.setupContext(msg, args);

        this.inspector.create(this.isolate);
    }

    async compileScript(code) {
        this.script = await this.isolate.compileScript(code, {
            filename: `file:///${filename}`
        });
    }

    async runScript(code) {
        if (typeof code !== "undefined") {
            await this.compileScript(code);
        }

        await this.inspector.waitForConnection();

        const res = await this.script.run(this.context, {
            timeout: this.timeLimit * 1000
        });

        return res;
    }

    async getIsolate(options) {
        const { msg, args } = options;

        await this.setupIsolate(msg, args);
        return this.isolate;
    }

    disposeInspector() {
        this.inspector.dispose();
        delete this.inspector;
    }

    disposeVMObjects() {
        this.global?.release();
        this.vmTag?.release();
        this.vmMsg?.release();

        delete this.global;
        delete this.vmTag;
        delete this.vmMsg;
    }

    disposeScript() {
        this.script?.release();
        delete this.script;
    }

    disposeContext() {
        this.context?.release();
        delete this.context;
    }

    disposeIsolate() {
        if (typeof this.isolate === "undefined") {
            return;
        }

        if (!this.isolate.isDisposed) {
            this.isolate.dispose();
        }

        delete this.isolate;
    }

    dispose() {
        this.disposeInspector();
        this.disposeVMObjects();
        this.disposeScript();
        this.disposeIsolate();
    }
}

export default EvalContext;
